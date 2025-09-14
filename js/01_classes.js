const LIGHT_DUAL_WIELD_WEAPONS = ['短刀', '爪', '拐棍'];
const ONE_HANDED_DUAL_WIELD_WEAPONS = ['單手劍', '斧頭', '彎刀'];

// --- 遊戲類別 ---
class Equipment {
    constructor(baseName, type, slot, material, quality, affix = null) {
        this.id = crypto.randomUUID();
        this.baseName = baseName;
        this.type = type;
        this.slot = slot;
        this.material = material;
        this.quality = quality;
        this.stats = {};
        this.specialAffix = affix;
        this.affixes = [];
        this.name = this.generateName();
    }

    generateName() {
        let prefix = '';
        if (this.specialAffix) {
            prefix = {
                'strength_curse': '脫力的 ',
                'agility_curse': '遲鈍的 ',
                'intelligence_curse': '愚鈍的 ',
                'luck_curse': '不幸的 ',
                'gundam_curse': '肛蛋的 ',
                'henshin_curse': '變身的 ',
            }[this.specialAffix] || '';
        } else if (this.affixes.length > 0) {
            prefix = this.affixes.map(affix => affix.name.slice(0, -1)).join(',') + ' ';
        }
        return `${prefix}${this.quality.name}的${this.material.name}${this.baseName}`;
    }
}

class Unit {
    constructor(name, stats, profession, race = 'human') {
        this.id = crypto.randomUUID();
        this.name = name;
        this.stats = { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 0, ...stats };
        this.profession = profession;
        this.race = race;
        this.maxHp = 0;
        this.currentHp = 0;
        this.skills = [];
        this.statusEffects = [];
    }

    isAlive() { return this.currentHp > 0; }

    getEquipmentBonus(stat) {
        if (!this.equipment) return 0;
        return Object.values(this.equipment).reduce((sum, item) => {
            if (!item || !item.stats) return sum;
            let bonus = 0;
            if (item.stats[stat]) {
                bonus += item.stats[stat];
            }
            if (stat !== 'hp' && item.stats.allStats) {
                bonus += item.stats.allStats;
            }
            return sum + bonus;
        }, 0);
    }

    getEquipmentHpBonus() {
        if (!this.equipment) return 0;
        
        // 初始化一個變數來累加總加成
        let totalHpBonus = 0;

        // 首先，加上來自裝備基礎屬性的HP (例如某些胸甲自帶的HP)
        totalHpBonus += this.getEquipmentBonus('hp');

        // 接著，遍歷所有裝備的詞綴，加上詞綴提供的純HP
        Object.values(this.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.type === 'stat') {
                    affix.effects.forEach(effect => {
                        if (effect.stat === 'hp' && effect.type !== 'multiplier') {
                            totalHpBonus += effect.value;
                        }
                    });
                }
            });
        });

        return totalHpBonus;
    }

    getTotalStat(stat, isStarving = false, gameState = null) {
        if (stat === 'hp') return this.calculateMaxHp(isStarving, gameState);
        if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck', 'charisma'].includes(stat)) {
            return 0;
        }
        let baseValue = this.stats[stat];
        let flatBonus = this.getEquipmentBonus(stat);
        Object.values(this.equipment || {}).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.type !== 'stat') return;
                affix.effects.forEach(effect => {
                    if ((effect.stat === stat || effect.stat === 'all') && effect.type !== 'multiplier') {
                        flatBonus += effect.value;
                    }
                });
            });
        });
        let multiplier = 1.0;
        Object.values(this.equipment || {}).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.type !== 'stat') return;
                affix.effects.forEach(effect => {
                    if ((effect.stat === stat || effect.stat === 'all') && effect.type === 'multiplier') {
                        multiplier *= effect.value;
                    }
                });
            });
        });
        let total = Math.floor((baseValue + flatBonus) * multiplier);
        total = Math.max(0, total);

        // 計算所有屬性減益效果
        if (this.statusEffects && this.statusEffects.length > 0) {
            const debuffEffect = this.statusEffects.find(e => e.type === 'stat_debuff');
            if (debuffEffect) {
                total = Math.floor(total * (1 - debuffEffect.multiplier));
            }
        }
        
        // 日夜被動技能的邏輯
        if (gameState && gameState.currentRaid && gameState.currentRaid.timeCycle) {
            if (this.race === 'elf' && gameState.currentRaid.timeCycle === 'day') {
                total = Math.floor(total * 1.2);
            } else if (this.race === 'beastkin' && gameState.currentRaid.timeCycle === 'night') {
                total = Math.floor(total * 1.2);
            }
        }

        return isStarving ? Math.floor(total * 0.75) : total;
    }

    getAverageStat(statsToAverage, isStarving = false, gameState = null) {
        if (!statsToAverage || statsToAverage.length === 0) {
            return 0;
        }
        const total = statsToAverage.reduce((sum, stat) => {
            return sum + this.getTotalStat(stat, isStarving, gameState);
        }, 0);
        return Math.floor(total / statsToAverage.length);
    }

    tickCooldowns() {
        if (this.skills && this.skills.length > 0) {
            this.skills.forEach(skill => {
                if (skill.currentCooldown > 0) {
                    skill.currentCooldown--;
                }
            });
        }
    }

    calculateDamage(isStarving = false, gameState = null) {
        const mainHand = this.equipment.mainHand;
        const offHand = this.equipment.offHand;
        let finalDamage = 0;

        // --- 1. 計算主手傷害 ---
        let mainHandDamage = 0;
        if (mainHand) {
            // 現在傷害只看武器的基礎傷害值
            mainHandDamage = mainHand.stats.damage || 0;
        } else {
            // 徒手傷害計算 (維持不變)
            const totalStats = this.getTotalStat('strength', isStarving, gameState) + this.getTotalStat('agility', isStarving, gameState) + this.getTotalStat('intelligence', isStarving, gameState) + this.getTotalStat('luck', isStarving, gameState);
            mainHandDamage = Math.floor(totalStats / 10);
        }

        // --- 2. 計算副手傷害 (雙持) ---
        let offHandDamage = 0;
        if (offHand && offHand.type === 'weapon' && offHand.baseName !== '盾') {
            let baseDamage = offHand.stats.damage || 0;

            // 副手傷害現在只看武器基礎傷害，並套用懲罰係數
            let offHandMultiplier = 0.75; // 標準懲罰
            if (mainHand && LIGHT_DUAL_WIELD_WEAPONS.includes(mainHand.baseName) && LIGHT_DUAL_WIELD_WEAPONS.includes(offHand.baseName)) {
                offHandMultiplier = 1.0; // 輕型武器無懲罰
            }
            offHandDamage = Math.floor(baseDamage * offHandMultiplier);
        }
        
        // --- 3. 處理特殊加成與懲罰 ---
        // 原生的雙手武器，例如雙手劍，獲得額外 50% 總傷害加成
        if (mainHand && mainHand.baseName === '雙手劍') {
            mainHandDamage = Math.floor(mainHandDamage * 1.5);
        }

        // 「雙手持握」系統：持單手武器且副手為空時，獲得 25% 傷害加成
        if (mainHand && ONE_HANDED_DUAL_WIELD_WEAPONS.includes(mainHand.baseName) && !offHand) {
            mainHandDamage = Math.floor(mainHandDamage * 1.25);
        }

        // 長槍/法杖 + 盾牌的懲罰
        if (mainHand && (mainHand.baseName === '長槍' || mainHand.baseName === '法杖') && offHand && offHand.baseName === '盾') {
            mainHandDamage = Math.floor(mainHandDamage * 0.7);
        }

        // --- 4. 加總所有傷害來源 ---
        const armorBonus = this.equipment.chest?.stats.attackBonus || 0;
        const shieldAttackBonus = (offHand && offHand.baseName === '盾') ? (offHand.stats.attackBonus || 0) : 0;
        
        finalDamage = mainHandDamage + offHandDamage + armorBonus + shieldAttackBonus;
        
        return finalDamage;
    }
}

class Goblin extends Unit {
    constructor(name, stats) {
        super(name, stats, '哥布林');
        this.hasBeenTrained = false;
        this.equipment = {
            mainHand: null,
            offHand: null,
            chest: null,
        };
    }

    _getFeminizedStats(isStarving = false) {
        const originalStr = super.getTotalStat('strength', isStarving);
        const originalAgi = super.getTotalStat('agility', isStarving);
        const originalInt = super.getTotalStat('intelligence', isStarving);
        const originalLuk = super.getTotalStat('luck', isStarving);
        const totalStats = originalStr + originalAgi + originalInt + originalLuk;
        if (totalStats === 0) {
            return { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 0 };
        }
        const newCharisma = Math.floor(totalStats / 5);
        const remainingPool = totalStats - newCharisma;
        return {
            strength: Math.floor(remainingPool * (originalStr / totalStats)),
            agility: Math.floor(remainingPool * (originalAgi / totalStats)),
            intelligence: Math.floor(remainingPool * (originalInt / totalStats)),
            luck: Math.floor(remainingPool * (originalLuk / totalStats)),
            charisma: newCharisma
        };
    }

    getTotalStat(stat, isStarving = false) {
        if (this.statusEffects.some(e => e.type === 'feminized')) {
            const feminizedStats = this._getFeminizedStats(isStarving);
            return feminizedStats[stat] || 0;
        }
        return super.getTotalStat(stat, isStarving);
    }
    
    getPartyHpBonus(isStarving = false) { return 0; }

    getEffectiveEquipmentBonus(stat) {
        const totalStat = this.getTotalStat(stat, this.isStarving);
        let baseValue = this.stats[stat] + this.getPartyBonus(stat);
        const specialAffixMod = this.getSpecialAffixModifier(stat);
        baseValue += specialAffixMod.bonus - specialAffixMod.penalty;
        const effectiveBonus = totalStat - baseValue;
        return Math.round(effectiveBonus);
    }

    getBaseMaxHp(isStarving = false) {
        let total = (this.stats.strength || 0) + (this.stats.agility || 0) + (this.stats.intelligence || 0) + (this.stats.luck || 0);
        if (isStarving) total = Math.floor(total * 0.75);
        
        const hasRootDebuff = this.statusEffects.some(e => e.type === 'root_debuff');
        const hpMultiplier = hasRootDebuff ? 4 : 6;
        let baseHp = total * hpMultiplier;

        if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
            baseHp = Math.floor(baseHp * 0.85);
        }
        return Math.max(1, baseHp);
    }

    calculateMaxHp(isStarving = false) {
        let maxHp = this.getBaseMaxHp(isStarving);
        maxHp += this.getPartyHpBonus(isStarving);
        maxHp += this.getEquipmentBonus('hp');

        // 初始化一個變數來累加來自詞綴的純生命值
        let flatAffixHpBonus = 0;
        let hpMultiplier = 1.0;

        Object.values(this.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.type !== 'stat') return;
                affix.effects.forEach(effect => {
                    // 原本只有乘法邏輯，現在加入對純數值的判斷
                    if (effect.stat === 'hp') {
                        if (effect.type === 'multiplier') {
                            hpMultiplier *= effect.value;
                        } else {
                            // 如果不是乘法，就是純數值加成
                            flatAffixHpBonus += effect.value;
                        }
                    }
                });
            });
        });

        // 在套用百分比乘法前，先把所有純數值加總
        maxHp += flatAffixHpBonus;
        
        maxHp = Math.floor(maxHp * hpMultiplier);
        return Math.max(1, maxHp);
    }
    
    updateHp(isStarving = false) {
        const oldMaxHp = this.maxHp;
        this.maxHp = this.calculateMaxHp(isStarving);
        const hpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
        this.currentHp = Math.round(this.maxHp * hpPercentage);
        if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
        this.currentHp = Math.max(0, this.currentHp);
    }

    calculateDamage(isStarving = false) {
        let finalDamage = super.calculateDamage(isStarving);
        if (this.activeSkillBuff) {
            const statToUse = this.activeSkillBuff.stat || 'strength';
            const totalStatValue = this.getTotalStat(statToUse, isStarving);
            const bonusDamage = Math.floor(totalStatValue * this.activeSkillBuff.multiplier);
            finalDamage += bonusDamage;
            this.activeSkillBuff = null; 
        }
        return finalDamage;
    }
}

class Player extends Goblin {
    constructor(name, stats, appearance, height, penisSize) {
        super(name, stats);
        this.appearance = appearance;
        this.height = height;
        this.penisSize = penisSize;
        this.skillPoints = 0;
        this.attributePoints = 0;
        this.learnedSkills = {};
        this.tribeSkillCooldowns = {};
        this.activeSkillBuff = null;
        this.party = [];
        this.avatarUrl = null;
        this.inventory = [];
        this.redeemedCodes = [];
    }

    getPartyHpBonus(isStarving = false) {
        if (!this.party || this.party.length === 0) return 0;
        let total = this.party.reduce((sum, p) => {
            const partnerStatSum = p.stats.strength + p.stats.agility + p.stats.intelligence + p.stats.luck;
            return sum + partnerStatSum;
        }, 0);
        const partyBonus = Math.floor(total * 0.5);
        
        const hasRootDebuff = this.statusEffects.some(e => e.type === 'root_debuff');
        const hpMultiplier = hasRootDebuff ? 4 : 6;
        let finalBonus = (isStarving ? Math.floor(partyBonus * 0.75) : partyBonus) * hpMultiplier;

        if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
            finalBonus = Math.floor(finalBonus * 0.85);
        }
        return finalBonus;
    }

    getPartyBonus(stat) {
        if (!this.party || !stat || stat === 'hp' || stat === 'damage') return 0;
        const skillId = 'tribe_01';
        if (!this.learnedSkills || !this.learnedSkills[skillId]) return 0;
        const skillData = SKILL_TREES.combat.find(s => s.id === skillId);
        if (!skillData) return 0;
        const currentLevel = this.learnedSkills[skillId];
        const skillLevelData = skillData.levels[currentLevel - 1];
        if (!skillLevelData) return 0;
        const totalBonusFromParty = this.party.reduce((sum, p) => sum + (p.stats[stat] || 0), 0);
        return Math.floor(totalBonusFromParty * skillLevelData.passive);
    }

    getSpecialAffixModifier(stat) {
        const modifier = { bonus: 0, penalty: 0 };
        if (!this.equipment) return modifier;
        const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);
        Object.values(this.equipment).forEach(item => {
            if (!item || !item.specialAffix) return;
            switch (item.specialAffix) {
                case 'strength_curse':
                    if (zeroStats.includes('strength')) { if (stat === 'strength') modifier.bonus += 30; } 
                    else { modifier.penalty += 30; }
                    break;
                case 'agility_curse':
                    if (zeroStats.includes('agility')) { if (stat === 'agility') modifier.bonus += 30; }
                    else { modifier.penalty += 30; }
                    break;
                case 'intelligence_curse':
                    if (zeroStats.includes('intelligence')) { if (stat === 'intelligence') modifier.bonus += 30; }
                    else { modifier.penalty += 30; }
                    break;
                case 'luck_curse':
                    if (zeroStats.includes('luck')) { if (stat === 'luck') modifier.bonus += 30; }
                    else { modifier.penalty += 30; }
                    break;
                case 'gundam_curse':
                    if (zeroStats.length === 2) { if (zeroStats.includes(stat)) modifier.bonus += 15; }
                    else { modifier.penalty += 15; }
                    break;
                case 'henshin_curse':
                    if (zeroStats.length === 3) { if (zeroStats.includes(stat)) modifier.bonus += 10; }
                    else { modifier.penalty += 10; }
                    break;
            }
        });
        return modifier;
    }

    getTotalStat(stat, isStarving = false) {
        let total = super.getTotalStat(stat, isStarving);
        total += this.getPartyBonus(stat);
        const specialAffixMod = this.getSpecialAffixModifier(stat);
        total += specialAffixMod.bonus - specialAffixMod.penalty;
        return Math.max(0, total);
    }

    getEffectiveIntelligence() {
        const baseInt = this.stats.intelligence || 0;
        const equipInt = this.getEquipmentBonus('intelligence');
        return baseInt + equipInt;
    }

    //技能冷卻時間
    getFinalCooldown(skill) {
        if (!skill) return 0;
        const effectiveInt = this.getEffectiveIntelligence();
        const quickCooldownSkillId = 'combat_quick_cooldown';
        let quickCooldownLevel = 0;
        if (this.learnedSkills[quickCooldownSkillId]) {
            const quickCooldownData = SKILL_TREES.combat.find(s => s.id === quickCooldownSkillId);
            const currentLevel = this.learnedSkills[quickCooldownSkillId];
            quickCooldownLevel = quickCooldownData.levels[currentLevel - 1].effect.value;
        }

        // 技能是戰鬥技能時，才計算智力減免
        let intReduction = 0; // 預設智力減免為 0
        if (skill.combatActive) {
            intReduction = Math.floor(effectiveInt / 20);
        }

        const finalCd = skill.baseCooldown - intReduction - quickCooldownLevel;
        return Math.max(skill.minCooldown || 1, finalCd);
    }

    //技能持續時間
    getFinalDuration(skill) {
        if (!skill || !skill.baseDuration) return 0;
        const effectiveInt = this.getEffectiveIntelligence();
        const intBonus = Math.floor(effectiveInt / 20);
        return skill.baseDuration + intBonus;
    }
    /**
     * 專門計算由「集團策略」技能帶來的生命值加成。
     * @param {boolean} isStarving - 是否處於飢餓狀態。
     * @returns {number} - 技能提供的額外生命值。
     */
    getSkillHpBonus(isStarving = false) {
        const skillId = 'tribe_01';
        if (!this.learnedSkills || !this.learnedSkills[skillId]) {
            return 0; // 如果沒學技能，則不提供加成
        }

        // 取得技能提供的四項屬性總和
        const strBonus = this.getPartyBonus('strength');
        const agiBonus = this.getPartyBonus('agility');
        const intBonus = this.getPartyBonus('intelligence');
        const lukBonus = this.getPartyBonus('luck');
        let totalSkillStatBonus = strBonus + agiBonus + intBonus + lukBonus;

        // 如果飢餓，技能提供的屬性也要打折
        if (isStarving) {
            totalSkillStatBonus = Math.floor(totalSkillStatBonus * 0.75);
        }

        // 使用與哥布林基礎血量計算相同的係數和懲罰
        const hpMultiplier = this.statusEffects.some(e => e.type === 'root_debuff') ? 4 : 6;
        let skillHpBonus = totalSkillStatBonus * hpMultiplier;

        // 同樣要計算雙手武器的血量懲罰
        if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
            skillHpBonus = Math.floor(skillHpBonus * 0.85);
        }

        return skillHpBonus;
    }

    /**
     * 覆蓋父類別(Goblin)的血量計算函式，以加入技能帶來的加成。
     * @param {boolean} isStarving - 是否處於飢餓狀態。
     * @returns {number} - 最終的最大生命值。
     */
    calculateMaxHp(isStarving = false) {
        // 1. 先呼叫父類別的原始計算方法，取得基礎、夥伴、裝備詞綴帶來的血量
        let maxHp = super.calculateMaxHp(isStarving);
        
        // 2. 然後，額外再加上由「集團策略」技能計算出的生命值
        maxHp += this.getSkillHpBonus(isStarving);
        
        // 3. 回傳最終結果
        return Math.max(1, maxHp);
    }
}

class Human extends Unit {
    constructor(name, stats, profession, race = 'human') {
        super(name, stats, profession, race);
        this.equipment = { mainHand: null, offHand: null, chest: null };
    }

    getBaseMaxHp(isStarving = false) {
        let total = (this.stats.strength || 0) + (this.stats.agility || 0) + (this.stats.intelligence || 0) + (this.stats.luck || 0);
        let baseHp = total * 4;
        return Math.max(1, baseHp);
    }

    calculateMaxHp(isStarving = false) {
        // 不再使用 getTotalStat，而是直接使用角色的基礎能力值 (this.stats)
        const totalStr = this.stats.strength || 0;
        const totalAgi = this.stats.agility || 0;
        const totalInt = this.stats.intelligence || 0;
        const totalLuc = this.stats.luck || 0;

        let maxHp = (totalStr + totalAgi + totalInt + totalLuc) * 4; // 人類的血量係數為 4

        // 直接呼叫我們之前修正過的 getEquipmentHpBonus 函式
        // 這個函式只會計算裝備上明確標示的 HP 加成 (來自基礎屬性或詞綴)
        maxHp += this.getEquipmentHpBonus();
        
        // 飢餓懲罰
        if (isStarving) {
            maxHp = Math.floor(maxHp * 0.75);
        }

        return Math.max(1, maxHp);
    }

    updateHp(isStarving = false) {
        const oldMaxHp = this.maxHp;
        this.maxHp = this.calculateMaxHp(isStarving);
        const hpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
        this.currentHp = Math.round(this.maxHp * hpPercentage);
    }
}

class FemaleHuman extends Human {
    constructor(name, stats, profession, visual, originDifficulty = 'easy', race = 'human') {
        super(name, stats, profession, race);
        this.visual = visual;
        this.isPregnant = false;
        this.pregnancyTimer = 0;
        this.isMother = false;
        this.breedingCount = 0;
        this.originDifficulty = originDifficulty; 
        this.maxHp = this.calculateMaxHp(); 
        this.currentHp = this.maxHp;
    }
}

class MaleHuman extends Human {
    constructor(name, stats, profession, originDifficulty = 'easy', race = 'human') {
        super(name, stats, profession, race);
        this.originDifficulty = originDifficulty; 
        this.maxHp = this.calculateMaxHp();
        this.currentHp = this.maxHp;
    }
}

class KnightOrderUnit extends MaleHuman {
    constructor(unitType, totalStatPoints, originDifficulty = 'easy') { 
        const unitDetails = KNIGHT_ORDER_UNITS[unitType];
        const stats = distributeStatsWithRatio(totalStatPoints, unitDetails.ratio);
        super(unitType, stats, unitType, originDifficulty);
        this.skills = [];
        if (unitDetails.skill) {
            const skillCopy = JSON.parse(JSON.stringify(unitDetails.skill));
            skillCopy.currentCooldown = 0;
            this.skills.push(skillCopy);
        }
    }
}

class FemaleKnightOrderUnit extends FemaleHuman {
    constructor(unitType, totalStatPoints, difficulty = 'easy') { 
        const unitDetails = KNIGHT_ORDER_UNITS[unitType];
        const stats = distributeStatsWithFemaleKnightRatio(totalStatPoints, unitDetails.ratio);
        const visual = generateVisuals();
        const name = FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)];
        super(name, stats, unitType, visual, difficulty); 
        this.skills = [];
        if (unitDetails.skill) {
            const skillCopy = JSON.parse(JSON.stringify(unitDetails.skill));
            skillCopy.currentCooldown = 0;
            this.skills.push(skillCopy);
        }
    }
}

// --- 特殊 BOSS 類別 ---
class ApostleMaiden extends FemaleHuman {
    constructor(combatContext) {
        const data = SPECIAL_BOSSES.apostle_maiden;
        super(data.name, data.stats, data.profession, data.visual);
        this.combat = combatContext;
        this.skills = [];
        if (data.skills) {
            data.skills.forEach(skillData => {
                const skillCopy = JSON.parse(JSON.stringify(skillData));
                skillCopy.currentCooldown = 0;
                this.skills.push(skillCopy);
            });
        }
        this.calculateMaxHp = () => {
            const baseStats = data.stats;
            const totalStats = baseStats.strength + baseStats.agility + baseStats.intelligence + baseStats.luck + baseStats.charisma;
            return Math.floor(totalStats * 7.3577);
        };
        this.maxHp = this.calculateMaxHp();
        this.currentHp = this.maxHp;
    }

    getTotalStat(stat, isStarving = false) {
        let baseValue = super.getTotalStat(stat, isStarving);
        if (['strength', 'agility', 'intelligence', 'luck', 'charisma'].includes(stat)) {
            if (this.combat && this.combat.enemies) {
                const apostleCount = this.combat.enemies.filter(enemy => enemy.profession === '使徒').length;
                const N = Math.min(apostleCount, 20);
                if (N > 0) {
                    baseValue *= N;
                }
            }
        }
        return baseValue;
    }
}

class SpiralGoddess extends FemaleHuman {
    constructor(combatContext) {
        const data = SPECIAL_BOSSES.spiral_goddess_mother;
        super(data.name, data.stats, data.profession, data.visual);
        this.combat = combatContext;
        this.phase = 1;
        this.qnaIndex = 0;
        this.phase2_triggered = false;
        this.phase3_triggered = false;
        this.phase4_triggered = false;
        this.phase5_triggered = false;
        this.calculateMaxHp = () => {
            const baseStats = data.stats;
            const totalStats = baseStats.strength + baseStats.agility + baseStats.intelligence + baseStats.luck + baseStats.charisma;
            return Math.floor(totalStats * 7.3577);
        };
        this.maxHp = this.calculateMaxHp();
        this.currentHp = this.maxHp;
    }
}