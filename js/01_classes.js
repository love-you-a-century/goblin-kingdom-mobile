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

                // 第一步：優先檢查是不是「特殊彩蛋裝備」
                if (this.specialAffix) { // <--- 我們將 'this.affix' 改名為 'this.specialAffix'
                    // 如果是，就執行跟舊版完全一樣的邏輯，來獲得"脫力的"、"肛蛋的"等名稱
                    prefix = {
                        'strength_curse': '脫力的 ',
                        'agility_curse': '遲鈍的 ',
                        'intelligence_curse': '愚鈍的 ',
                        'luck_curse': '不幸的 ',
                        'gundam_curse': '肛蛋的 ',
                        'henshin_curse': '變身的 ',
                    }[this.specialAffix] || '';
                    // 找到彩蛋詞綴後，這個函數的詞綴處理部分就結束了，直接跳到最後回傳名稱。
                } 
                
                // 第二步：如果不是彩蛋裝備，才檢查它有沒有「標準詞綴」
                else if (this.affixes.length > 0) {
                    // 這裡 'this.affixes' 是我們新增的陣列，例如可能包含 ['強壯的', '吸血的']
                    // .map(affix => affix.name) 會取出每個詞綴的名字
                    // .join('') 會將它們串在一起
                    prefix = this.affixes.map(affix => affix.name).join('') + ' ';
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
            calculateMaxHp() { return 0; }
            
            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat)) return 0;
                let total = this.stats[stat] || 0;
                return total;
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
                // 對於非玩家單位，傷害預設為其總力量值
                return this.getTotalStat('strength', isStarving);
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
            getEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                return Object.values(this.equipment).reduce((sum, item) => {
                    return sum + (item && item.stats && item.stats[stat] ? item.stats[stat] : 0);
                }, 0);
            }
            getTotalStat(stat, isStarving = false) {
                if (!this.stats.hasOwnProperty(stat)) return 0;
                let baseValue = this.stats[stat];
                let flatBonus = this.getEquipmentBonus(stat);
                
                let multiplier = 1.0;
                Object.values(this.equipment).forEach(item => {
                    if (!item) return;
                    item.affixes.forEach(affix => {
                        if (affix.type !== 'stat') return;
                        affix.effects.forEach(effect => {
                            if (effect.stat === stat || effect.stat === 'all') {
                                if (effect.type === 'multiplier') {
                                    multiplier *= effect.value;
                                }
                            }
                        });
                    });
                });
                
                let total = Math.floor((baseValue + flatBonus) * multiplier);
                return isStarving ? Math.floor(total * 0.75) : total;
            }
            calculateMaxHp(isStarving = false) {
                const totalStr = this.getTotalStat('strength', isStarving);
                const totalAgi = this.getTotalStat('agility', isStarving);
                const totalInt = this.getTotalStat('intelligence', isStarving);
                const totalLuc = this.getTotalStat('luck', isStarving);
                let maxHp = (totalStr + totalAgi + totalInt + totalLuc) * 6 + this.getEquipmentBonus('hp');
                 if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
                    maxHp = Math.floor(maxHp * 0.85);
                }
                return Math.max(1, maxHp);
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

                    // 【新增】單手持有懲罰邏輯
                    if (hasShield && (weaponType === '長槍' || weaponType === '法杖')) {
                        // 這就是您可以隨時調整的平衡係數
                        const oneHandedPenalty = 0.7; // 傷害變為 70%
                        weaponDamage = Math.floor(weaponDamage * oneHandedPenalty);
                    }

                } else {
                    weaponDamage = this.getTotalStat('strength', isStarving);
                }
                const shieldBonus = this.equipment.offHand?.stats?.damage || 0;
                const armorBonus = this.equipment.chest?.stats?.damage || 0;
                return weaponDamage + shieldBonus + armorBonus;
            }
            updateHp(isStarving = false) {
                const oldMaxHp = this.maxHp;
                this.maxHp = this.calculateMaxHp(isStarving);
                const hpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
                this.currentHp = Math.round(this.maxHp * hpPercentage);
                if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
                this.currentHp = Math.max(0, this.currentHp);
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
                this.party = [];
                this.avatarUrl = null;
                this.inventory = [];
                this.equipment = {
                    mainHand: null,
                    offHand: null,
                    chest: null,
                };
                this.maxHp = this.calculateMaxHp();
                this.currentHp = this.maxHp;
            }
            getPartyBonus(stat) {
                if (!this.party || !stat || stat === 'hp' || stat === 'damage') return 0;
                const totalBonus = this.party.reduce((sum, p) => sum + (p.stats[stat] || 0), 0);
                return Math.floor(totalBonus * 0.5);
            }
            getEquipmentBonus(stat) {
                if (!this.equipment || !stat) return 0;
                let flatBonus = 0;
                Object.values(this.equipment).forEach(item => {
                    if (!item || !item.stats) return;
                    // 只加總來自裝備基礎屬性的加值 (白字)
                    if (item.stats[stat]) {
                        flatBonus += item.stats[stat];
                    }
                });
                return flatBonus;
            }
            // 【新增此函數】
            getEffectiveEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                
                const totalStat = this.getTotalStat(stat, this.isStarving);
                
                // 計算出所有非裝備來源的屬性總和
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);
                baseValue += this.getAffixEffect(stat).bonus;
                baseValue -= this.getAffixPenalty();
                
                // 從最終總屬性中減去非裝備屬性，得出的就是裝備提供的等效加成值
                const effectiveBonus = totalStat - baseValue;

                return Math.round(effectiveBonus);
            }
            // 【新增此方法】
            getAffixEffect(stat) {
                const bonus = { bonus: 0 };
                if (!this.equipment) return bonus;
                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);

                const checkAffix = (item, affixName, requiredStat, bonusValue) => {
                    if (item && item.specialAffix === affixName && this.stats[requiredStat] === 0) {
                        if (stat === requiredStat) {
                            bonus.bonus += bonusValue;
                        }
                    }
                };
                
                checkAffix(this.equipment.mainHand, 'strength_curse', 'strength', 10);
                checkAffix(this.equipment.mainHand, 'agility_curse', 'agility', 10);
                checkAffix(this.equipment.mainHand, 'intelligence_curse', 'intelligence', 10);
                checkAffix(this.equipment.mainHand, 'luck_curse', 'luck', 10);

                if (this.equipment.offHand && this.equipment.offHand.specialAffix === 'gundam_curse' && zeroStats.length === 2) {
                    if (zeroStats.includes(stat)) {
                        bonus.bonus += 8;
                    }
                }

                if (this.equipment.chest && this.equipment.chest.specialAffix === 'henshin_curse' && zeroStats.length === 3) {
                     if (zeroStats.includes(stat)) {
                        bonus.bonus += 5;
                    }
                }
                return bonus;
            }
            // 【新增此方法】
            getAffixPenalty() {
                let penalty = 0;
                if (!this.equipment) return penalty;
                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);

                const checkPenalty = (item, affixName, requiredStat, penaltyValue) => {
                    if (item && item.specialAffix === affixName && this.stats[requiredStat] !== 0) {
                        penalty += penaltyValue;
                    }
                };

                checkPenalty(this.equipment.mainHand, 'strength_curse', 'strength', 10);
                checkPenalty(this.equipment.mainHand, 'agility_curse', 'agility', 10);
                checkPenalty(this.equipment.mainHand, 'intelligence_curse', 'intelligence', 10);
                checkPenalty(this.equipment.mainHand, 'luck_curse', 'luck', 10);
                
                if (this.equipment.offHand && this.equipment.offHand.specialAffix === 'gundam_curse' && zeroStats.length !== 2) {
                    penalty += 8;
                }
                if (this.equipment.chest && this.equipment.chest.specialAffix === 'henshin_curse' && zeroStats.length !== 3) {
                    penalty += 5;
                }
                
                return penalty;
            }
            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck'].includes(stat)) {
                    return 0;
                }

                // 1. 基礎值 = 自身原始值 + 夥伴加成
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);

                // 2. 固定加成值 = 裝備基礎屬性 + 特殊詛咒裝備效果
                let flatBonus = this.getEquipmentBonus(stat); // 此處只應獲取裝備白字
                flatBonus += this.getAffixEffect(stat).bonus;
                flatBonus -= this.getAffixPenalty();

                // 3. 百分比乘積 = 所有標準詞綴的乘法效果疊乘
                let multiplier = 1.0;
                Object.values(this.equipment).forEach(item => {
                    if (!item) return;
                    item.affixes.forEach(affix => {
                        if (affix.type !== 'stat') return;
                        affix.effects.forEach(effect => {
                            if (effect.stat === stat || effect.stat === 'all') {
                                if (effect.type === 'multiplier') {
                                    multiplier *= effect.value;
                                }
                            }
                        });
                    });
                });
                
                // 4. 計算最終總值
                let total = Math.floor((baseValue + flatBonus) * multiplier);
                
                total = Math.max(0, total);
                
                // 5. 最後套用飢餓懲罰
                return isStarving ? Math.floor(total * 0.75) : total;
            }
            getBaseMaxHp(isStarving = false) {
                let total = (this.stats.strength || 0) + (this.stats.agility || 0) + (this.stats.intelligence || 0) + (this.stats.luck || 0);
                if(isStarving) total = Math.floor(total * 0.75);
                return total * 6;
            }
            getPartyHpBonus(isStarving = false) {
                if (!this.party || this.party.length === 0) return 0;
                let total = this.party.reduce((sum, p) => {
                    const partnerStatSum = p.stats.strength + p.stats.agility + p.stats.intelligence + p.stats.luck;
                    return sum + partnerStatSum;
                }, 0);
                const partyBonus = Math.floor(total * 0.5);
                return (isStarving ? Math.floor(partyBonus * 0.75) : partyBonus) * 6;
            }
            getEquipmentHpBonus() {
                return this.getEquipmentBonus('hp');
            }
            calculateMaxHp(isStarving = false) {
                // 【修正】使用 getTotalStat 來獲取包含所有加成的最終能力值
                const totalStr = this.getTotalStat('strength', isStarving);
                const totalAgi = this.getTotalStat('agility', isStarving);
                const totalInt = this.getTotalStat('intelligence', isStarving);
                const totalLuc = this.getTotalStat('luck', isStarving);

                // 【修正】生命值公式改為：(所有最終能力值總和 * 6) + 裝備直接提供的HP
                let maxHp = (totalStr + totalAgi + totalInt + totalLuc) * 6 + this.getEquipmentHpBonus();
                
                // 雙手劍懲罰
                if (this.equipment && this.equipment.mainHand && this.equipment.mainHand.baseName === '雙手劍') {
                    maxHp = Math.floor(maxHp * 0.85);
                }
                return Math.max(1, maxHp);
            }
            updateHp(isStarving = false) {
                const oldMaxHp = this.maxHp;
                const oldHpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
                
                // 先計算出新的最大生命值
                this.maxHp = this.calculateMaxHp(isStarving);

                // 【核心修正】如果最大生命值是增加的，且之前是滿血狀態，則直接補滿當前生命值
                if (this.maxHp > oldMaxHp && oldHpPercentage >= 1) {
                    this.currentHp = this.maxHp;
                } else {
                    // 否則，維持現有的血量百分比
                    this.currentHp = Math.round(this.maxHp * oldHpPercentage);
                }

                // 確保當前生命值不會超過上限或低於0
                this.currentHp = Math.min(this.currentHp, this.maxHp);
                this.currentHp = Math.max(0, this.currentHp);
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

                    // 【新增】單手持有懲罰邏輯
                    if (hasShield && (weaponType === '長槍' || weaponType === '法杖')) {
                        // 這就是您可以隨時調整的平衡係數
                        const oneHandedPenalty = 0.7; // 傷害變為 70%
                        weaponDamage = Math.floor(weaponDamage * oneHandedPenalty);
                    }

                } else {
                    weaponDamage = this.getTotalStat('strength', isStarving);
                }
                const shieldBonus = this.equipment.offHand?.stats?.damage || 0;
                const armorBonus = this.equipment.chest?.stats?.damage || 0;
                return weaponDamage + shieldBonus + armorBonus;
            }
        }
        
        class Human extends Unit {
            constructor(name, stats, profession) {
                super(name, stats, profession);
                // 【新增】初始化裝備欄位
                this.equipment = {
                    mainHand: null,
                    offHand: null,
                    chest: null,
                };
            }

            // 【新增】從 Goblin 類別複製過來的函式
            getEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                return Object.values(this.equipment).reduce((sum, item) => {
                    return sum + (item && item.stats && item.stats[stat] ? item.stats[stat] : 0);
                }, 0);
            }

            getTotalStat(stat, isStarving = false) {
                // 【核心修正】如果 this.stats 中沒有該屬性，或屬性值為 undefined/null，則將 baseValue 安全地設為 0
                let baseValue = this.stats[stat] || 0; 
                let flatBonus = this.getEquipmentBonus(stat);
                
                let multiplier = 1.0; // 敵人暫不處理複雜的詞綴乘法
                
                // 確保進行運算的都是有效數字
                let total = Math.floor(((baseValue || 0) + (flatBonus || 0)) * multiplier);
                return isStarving ? Math.floor(total * 0.75) : total;
            }

            // 【新增】從 Goblin 類別複製過來的函式
            calculateDamage(isStarving = false) {
                const mainHand = this.equipment.mainHand;
                let weaponDamage = 0;
                if (mainHand) {
                    const baseDamage = mainHand.stats.damage || 0;
                    const weaponType = mainHand.baseName;
                    let mainStatValue = 0;
                    const hasShield = this.equipment.offHand?.baseName === '盾';

                    switch (weaponType) {
                        case '劍': case '雙手劍':
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
                        const oneHandedPenalty = 0.7;
                        weaponDamage = Math.floor(weaponDamage * oneHandedPenalty);
                    }
                } else {
                    weaponDamage = this.getTotalStat('strength', isStarving);
                }
                const shieldBonus = this.equipment.offHand?.stats?.damage || 0;
                const armorBonus = this.equipment.chest?.stats?.damage || 0;
                return weaponDamage + shieldBonus + armorBonus;
            }

            // 【新增】一個簡易版的 updateHp
            updateHp(isStarving = false) {
                const oldMaxHp = this.maxHp;
                this.maxHp = this.calculateMaxHp(isStarving);
                const hpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
                this.currentHp = Math.round(this.maxHp * hpPercentage);
            }
        }
        
        class FemaleHuman extends Human {
             // 【修改】確保 constructor 的參數列表包含了 originDifficulty
            constructor(name, stats, profession, visual, originDifficulty = 'easy') { 
                super(name, stats, profession);
                this.visual = visual;
                this.isPregnant = false;
                this.pregnancyTimer = 0;
                this.isMother = false;
                // 【修改】這一行現在可以正確地從參數接收 originDifficulty
                this.originDifficulty = originDifficulty; 
                this.maxHp = this.calculateMaxHp();
                this.currentHp = this.maxHp;
            }
            calculateMaxHp() {
                const { strength, agility, intelligence, luck, charisma } = this.stats;
                return (strength + agility + intelligence + luck + charisma) * 5;
            }
        }

        class MaleHuman extends Human {
            constructor(name, stats, profession, originDifficulty = 'easy') { // 新增參數
                super(name, stats, profession);
                this.originDifficulty = originDifficulty; // 新增屬性
                this.maxHp = this.calculateMaxHp();
                this.currentHp = this.maxHp;
            }
            calculateMaxHp() {
                const { strength, agility, intelligence, luck } = this.stats;
                return (strength + agility + intelligence + luck) * 5;
            }
        }

        class KnightOrderUnit extends MaleHuman {
            constructor(unitType, totalStatPoints, originDifficulty = 'easy') { // 新增參數
                const unitDetails = KNIGHT_ORDER_UNITS[unitType];
                const stats = distributeStatsWithRatio(totalStatPoints, unitDetails.ratio);
                super(unitType, stats, unitType, originDifficulty); // 將參數傳遞給父類別
                this.skills = [];
                if (unitDetails.skill) {
                    this.skills.push({
                        ...unitDetails.skill,
                        currentCooldown: 0,
                    });
                }
            }
        }
        // 生成女性騎士團成員
        class FemaleKnightOrderUnit extends FemaleHuman {
            // 【修改】確保 constructor 接收 difficulty 參數
            constructor(unitType, totalStatPoints, difficulty = 'easy') { 
                const unitDetails = KNIGHT_ORDER_UNITS[unitType];
                const stats = distributeStatsWithFemaleKnightRatio(totalStatPoints, unitDetails.ratio);
                const visual = generateVisuals();
                const name = FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)];

                // 【修改】確保 super() 將 difficulty 參數傳遞給父類別 FemaleHuman
                super(name, stats, unitType, visual, difficulty); 
                
                this.skills = [];
                if (unitDetails.skill) {
                    this.skills.push({
                        ...unitDetails.skill,
                        currentCooldown: 0,
                    });
                }
            }
        }