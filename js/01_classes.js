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
    constructor(name, stats, profession) {
        this.id = crypto.randomUUID();
        this.name = name;
        this.stats = { strength: 0, agility: 0, intelligence: 0, luck: 0, charisma: 0, ...stats };
        this.profession = profession;
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

    getTotalStat(stat, isStarving = false) {
        if (stat === 'hp') return this.calculateMaxHp(isStarving);
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
        return isStarving ? Math.floor(total * 0.75) : total;
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

    calculateDamage(isStarving = false) {
        const mainHand = this.equipment.mainHand;
        let weaponDamage = 0;
        if (mainHand) {
            const baseDamage = mainHand.stats.damage || 0;
            const weaponType = mainHand.baseName;
            let mainStatValue = 0;
            const hasShield = this.equipment.offHand?.baseName === '盾';
            switch (weaponType) {
                case '劍':
                case '雙手劍':
                    mainStatValue = this.getTotalStat('strength', isStarving);
                    weaponDamage = mainStatValue + baseDamage;
                    if (weaponType === '雙手劍') weaponDamage = Math.floor(weaponDamage * 1.5);
                    break;
                case '長槍':
                    mainStatValue = this.getTotalStat('luck', isStarving);
                    weaponDamage = mainStatValue + baseDamage;
                    break;
                case '弓':
                    mainStatValue = this.getTotalStat('agility', isStarving);
                    weaponDamage = mainStatValue + baseDamage;
                    break;
                case '法杖':
                    mainStatValue = this.getTotalStat('intelligence', isStarving);
                    weaponDamage = mainStatValue + baseDamage;
                    break;
                default:
                    mainStatValue = this.getTotalStat('strength', isStarving);
                    weaponDamage = mainStatValue;
            }
            if (hasShield && (weaponType === '長槍' || weaponType === '法杖')) {
                weaponDamage = Math.floor(weaponDamage * 0.7);
            }
        } else {
            const totalStats = this.getTotalStat('strength', isStarving) + this.getTotalStat('agility', isStarving) + this.getTotalStat('intelligence', isStarving) + this.getTotalStat('luck', isStarving);
            weaponDamage = Math.floor(totalStats / 10);
        }
        const shieldBonus = this.equipment.offHand?.stats?.damage || 0;
        const armorBonus = this.equipment.chest?.stats?.damage || 0;
        return weaponDamage + shieldBonus + armorBonus;
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

    getEquipmentHpBonus() { return this.getEquipmentBonus('hp'); }

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
        let hpMultiplier = 1.0;
        Object.values(this.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.type !== 'stat') return;
                affix.effects.forEach(effect => {
                    if (effect.stat === 'hp' && effect.type === 'multiplier') {
                        hpMultiplier *= effect.value;
                    }
                });
            });
        });
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
        const intReduction = Math.floor(effectiveInt / 120);
        const finalCd = skill.baseCooldown - intReduction - quickCooldownLevel;
        return Math.max(skill.minCooldown || 1, finalCd);
    }

    getFinalDuration(skill) {
        if (!skill || !skill.baseDuration) return 0;
        const effectiveInt = this.getEffectiveIntelligence();
        const intBonus = Math.floor(effectiveInt / 80);
        return skill.baseDuration + intBonus;
    }
}

class Human extends Unit {
    constructor(name, stats, profession) {
        super(name, stats, profession);
        this.equipment = { mainHand: null, offHand: null, chest: null };
    }

    getBaseMaxHp(isStarving = false) {
        let total = (this.stats.strength || 0) + (this.stats.agility || 0) + (this.stats.intelligence || 0) + (this.stats.luck || 0);
        let baseHp = total * 4;
        return Math.max(1, baseHp);
    }

    calculateMaxHp(isStarving = false) {
        const totalStr = this.getTotalStat('strength', isStarving);
        const totalAgi = this.getTotalStat('agility', isStarving);
        const totalInt = this.getTotalStat('intelligence', isStarving);
        const totalLuc = this.getTotalStat('luck', isStarving);
        let maxHp = (totalStr + totalAgi + totalInt + totalLuc) * 4;
        maxHp += this.getEquipmentBonus('hp');
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
    constructor(name, stats, profession, visual, originDifficulty = 'easy') { 
        super(name, stats, profession);
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
    constructor(name, stats, profession, originDifficulty = 'easy') { 
        super(name, stats, profession);
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