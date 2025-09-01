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
                this.specialAffix = affix; // 原本錯誤地寫成了 specialAffix
                this.affixes = [];
                this.name = this.generateName();
            }

           generateName() {
                let prefix = '';

                // 特殊詛咒詞綴的邏輯維持不變
                if (this.specialAffix) {
                    prefix = {
                        'strength_curse': '脫力的 ',
                        'agility_curse': '遲鈍的 ',
                        'intelligence_curse': '愚鈍的 ',
                        'luck_curse': '不幸的 ',
                        'gundam_curse': '肛蛋的 ',
                        'henshin_curse': '變身的 ',
                    }[this.specialAffix] || '';
                } 
                
                // 【核心修改】如果不是特殊詞綴，且有多個標準詞綴
                else if (this.affixes.length > 0) {
                    // 1. 取得所有詞綴名稱 (例如 "力量的", "敏捷的")
                    // 2. 使用 slice(0, -1) 移除每個名稱最後的 "的" 字
                    // 3. 使用 join(',') 將處理過的名稱用逗號串連起來
                    // 4. 最後加上一個空格
                    prefix = this.affixes.map(affix => affix.name.slice(0, -1)).join(',') + ' ';
                }
                
                // 最後，組合名稱並回傳
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

            // 【核心】現在所有單位都使用這套最完整的裝備加成計算
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

            // 【核心】現在所有單位都使用這套最完整的總能力計算
            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck'].includes(stat)) {
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

                    // 單手持有懲罰邏輯
                    if (hasShield && (weaponType === '長槍' || weaponType === '法杖')) {
                        const oneHandedPenalty = 0.7; // 傷害變為 70%
                        weaponDamage = Math.floor(weaponDamage * oneHandedPenalty);
                    }

                } else {
                    // 徒手傷害邏輯
                    const totalStats = this.getTotalStat('strength', isStarving) +
                                    this.getTotalStat('agility', isStarving) +
                                    this.getTotalStat('intelligence', isStarving) +
                                    this.getTotalStat('luck', isStarving);
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
            
            getPartyHpBonus(isStarving = false) {
                return 0; // 夥伴沒有隊伍HP加成
            }

            getEquipmentHpBonus() {
                // 這個函式現在只是一個快捷方式，直接呼叫繼承來的 getEquipmentBonus
                return this.getEquipmentBonus('hp');
            }

            getEffectiveEquipmentBonus(stat) {
                // 這個函式用來計算裝備提供的所有「非HP」屬性總加成
                const totalStat = this.getTotalStat(stat, this.isStarving);
                
                // 從總值中，減去所有非裝備的項目
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);
                const specialAffixMod = this.getSpecialAffixModifier(stat);
                baseValue += specialAffixMod.bonus - specialAffixMod.penalty;
                
                const effectiveBonus = totalStat - baseValue;

                return Math.round(effectiveBonus);
            }

            getBaseMaxHp(isStarving = false) {
                let total = (this.stats.strength || 0) + (this.stats.agility || 0) + (this.stats.intelligence || 0) + (this.stats.luck || 0);
                if(isStarving) total = Math.floor(total * 0.75);
                let baseHp = total * 6;
                if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
                    baseHp = Math.floor(baseHp * 0.85);
                }
                return Math.max(1, baseHp);
            }

            // 【核心修正】
            calculateMaxHp(isStarving = false) {
                // 1. 取得基礎生命值 (來自原始屬性)
                let maxHp = this.getBaseMaxHp(isStarving);

                // 2. 【核心修正】加上來自夥伴的HP加成 (夥伴本身呼叫時此項為0，玩家呼叫時則會正確加上)
                maxHp += this.getPartyHpBonus(isStarving);

                // 3. 加上裝備直接提供的 HP 固定值
                maxHp += this.getEquipmentBonus('hp');

                // 4. 加上來自詞綴的 HP 百分比加成
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

                // 5. 返回最終結果 (雙手武器懲罰已在 getBaseMaxHp 中計算)
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

            // 玩家獨有：計算來自夥伴的 HP 加成
            getPartyHpBonus(isStarving = false) {
                if (!this.party || this.party.length === 0) return 0;
                let total = this.party.reduce((sum, p) => {
                    const partnerStatSum = p.stats.strength + p.stats.agility + p.stats.intelligence + p.stats.luck;
                    return sum + partnerStatSum;
                }, 0);
                const partyBonus = Math.floor(total * 0.5);
                let finalBonus = (isStarving ? Math.floor(partyBonus * 0.75) : partyBonus) * 6;

                // 修正：如果玩家自己拿著雙手劍，夥伴提供的HP加成也要打折
                if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
                    finalBonus = Math.floor(finalBonus * 0.85);
                }
                return finalBonus;
            }

            // 玩家獨有：計算來自「集團戰略」技能的屬性加成
            getPartyBonus(stat) {
                if (!this.party || !stat || stat === 'hp' || stat === 'damage') return 0;
                const skillId = 'tribe_01';
                if (!this.learnedSkills || !this.learnedSkills[skillId]) {
                    return 0;
                }
                const skillData = SKILL_TREES.combat.find(s => s.id === skillId);
                if (!skillData) return 0;
                const currentLevel = this.learnedSkills[skillId];
                const skillLevelData = skillData.levels[currentLevel - 1];
                if (!skillLevelData) return 0;
                const totalBonusFromParty = this.party.reduce((sum, p) => sum + (p.stats[stat] || 0), 0);
                return Math.floor(totalBonusFromParty * skillLevelData.passive);
            }

            // 玩家獨有：計算詛咒裝備的特殊效果
            getSpecialAffixModifier(stat) {
                const modifier = { bonus: 0, penalty: 0 };
                // ... (這段函式維持原樣，因為它是玩家專屬的) ...
                if (!this.equipment) return modifier;
                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);
                Object.values(this.equipment).forEach(item => {
                    if (!item || !item.specialAffix) return;
                    switch (item.specialAffix) {
                        case 'strength_curse':
                            if (zeroStats.includes('strength')) { if (stat === 'strength') modifier.bonus += 10; } 
                            else { modifier.penalty += 10; }
                            break;
                        case 'agility_curse':
                            if (zeroStats.includes('agility')) { if (stat === 'agility') modifier.bonus += 10; }
                            else { modifier.penalty += 10; }
                            break;
                        case 'intelligence_curse':
                            if (zeroStats.includes('intelligence')) { if (stat === 'intelligence') modifier.bonus += 10; }
                            else { modifier.penalty += 10; }
                            break;
                        case 'luck_curse':
                            if (zeroStats.includes('luck')) { if (stat === 'luck') modifier.bonus += 10; }
                            else { modifier.penalty += 10; }
                            break;
                        case 'gundam_curse':
                            if (zeroStats.length === 2) { if (zeroStats.includes(stat)) modifier.bonus += 8; }
                            else { modifier.penalty += 8; }
                            break;
                        case 'henshin_curse':
                            if (zeroStats.length === 3) { if (zeroStats.includes(stat)) modifier.bonus += 5; }
                            else { modifier.penalty += 5; }
                            break;
                    }
                });
                return modifier;
            }

            // 玩家獨有：總能力計算 (在繼承 Goblin 的基礎上，再加入自己的特殊加成)
            getTotalStat(stat, isStarving = false) {
                let total = super.getTotalStat(stat, isStarving); // 【關鍵】呼叫父類別 (Unit) 的通用計算方式
                
                // 再疊加上玩家專屬的加成
                total += this.getPartyBonus(stat);
                const specialAffixMod = this.getSpecialAffixModifier(stat);
                total += specialAffixMod.bonus - specialAffixMod.penalty;
                
                return Math.max(0, total);
            }

            // 玩家獨有：技能冷卻、持續時間等計算
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
                let baseHp = total * 4; // 敵人血量係數為 4
                return Math.max(1, baseHp);
            }

            // 簡易版的生命值計算 (敵人沒有複雜的詞綴或雙手懲罰)
            calculateMaxHp(isStarving = false) {
                const totalStr = this.getTotalStat('strength', isStarving);
                const totalAgi = this.getTotalStat('agility', isStarving);
                const totalInt = this.getTotalStat('intelligence', isStarving);
                const totalLuc = this.getTotalStat('luck', isStarving);
                let maxHp = (totalStr + totalAgi + totalInt + totalLuc) * 4; // 敵人血量係數為 5
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
                this.originDifficulty = originDifficulty; 
                
                // 現在會呼叫繼承自 Human 的、正確的 calculateMaxHp
                this.maxHp = this.calculateMaxHp(); 
                this.currentHp = this.maxHp;
            }
        }

        class MaleHuman extends Human {
            constructor(name, stats, profession, originDifficulty = 'easy') { 
                super(name, stats, profession);
                this.originDifficulty = originDifficulty; 
                
                // 現在會呼叫繼承自 Human 的、正確的 calculateMaxHp
                this.maxHp = this.calculateMaxHp();
                this.currentHp = this.maxHp;
            }
        }

        class KnightOrderUnit extends MaleHuman {
            constructor(unitType, totalStatPoints, originDifficulty = 'easy') { 
                const unitDetails = KNIGHT_ORDER_UNITS[unitType];
                const stats = distributeStatsWithRatio(totalStatPoints, unitDetails.ratio);
                super(unitType, stats, unitType, originDifficulty); // 將參數傳遞給父類別
                this.skills = [];
                this.skills = [];
                if (unitDetails.skill) {
                    // 使用 JSON.parse 和 JSON.stringify 進行深拷貝，確保每個實例都有獨立的技能物件
                    const skillCopy = JSON.parse(JSON.stringify(unitDetails.skill));
                    skillCopy.currentCooldown = 0; // 為拷貝後的物件添加冷卻時間
                    this.skills.push(skillCopy);
                }
            }
        }
        // 生成女性騎士團成員
        class FemaleKnightOrderUnit extends FemaleHuman {
            // 確保 constructor 接收 difficulty 參數
            constructor(unitType, totalStatPoints, difficulty = 'easy') { 
                const unitDetails = KNIGHT_ORDER_UNITS[unitType];
                const stats = distributeStatsWithFemaleKnightRatio(totalStatPoints, unitDetails.ratio);
                const visual = generateVisuals();
                const name = FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)];

                // 確保 super() 將 difficulty 參數傳遞給父類別 FemaleHuman
                super(name, stats, unitType, visual, difficulty); 
                
                this.skills = [];
                if (unitDetails.skill) {
                    // 使用 JSON.parse 和 JSON.stringify 進行深拷貝，確保每個實例都有獨立的技能物件
                    const skillCopy = JSON.parse(JSON.stringify(unitDetails.skill));
                    skillCopy.currentCooldown = 0; // 為拷貝後的物件添加冷卻時間
                    this.skills.push(skillCopy);
                }
            }
        }