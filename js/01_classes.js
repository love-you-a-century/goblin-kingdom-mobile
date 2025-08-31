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
            getPartyBonus(stat) {
                // 基礎單位沒有隊伍加成
                return 0;
            }
            getEquipmentBonus(stat) {
                // 基礎單位暫不計算裝備，除非之後為其添加邏輯
                return 0;
            }
            getAffixEffect(stat) {
                // 基礎單位沒有特殊詞綴效果
                return { bonus: 0 };
            }
            getAffixPenalty() {
                // 基礎單位沒有特殊詞綴懲罰
                return 0;
            }

            isAlive() { return this.currentHp > 0; }
            calculateMaxHp() { return 0; }

            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck'].includes(stat)) {
                    return 0;
                }

                // 1. 基礎值 = 自身原始值 + 夥伴加成
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);

                // 2. 固定加成值 = 裝備基礎屬性 + 特殊詛咒裝備效果 (正負)
                let flatBonus = this.getEquipmentBonus(stat);
                flatBonus += this.getAffixEffect(stat).bonus;
                flatBonus -= this.getAffixPenalty(); 

                // 3. 百分比乘積
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
            getEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                return Object.values(this.equipment).reduce((sum, item) => {
                    return sum + (item && item.stats && item.stats[stat] ? item.stats[stat] : 0);
                }, 0);
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
            this.learnedSkills = {};
            this.tribeSkillCooldowns = {};
            this.activeSkillBuff = null;
            this.party = [];
            this.avatarUrl = null;
            this.inventory = [];
            this.equipment = {
                mainHand: null,
                offHand: null,
                chest: null,
            };
            this.maxHp = 1;     // 給一個暫時的預設值，避免出錯
            this.currentHp = 1;   // 給一個暫時的預設值
            }

            getEffectiveIntelligence() {
                // 根據GDD：有效智力 = 原始智力 + 裝備智力
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
                // 根據GDD：最終持續時間 = 基礎持續時間 + floor(有效智力 / 80)
                const effectiveInt = this.getEffectiveIntelligence();
                const intBonus = Math.floor(effectiveInt / 80);
                return skill.baseDuration + intBonus;
            }

            getPartyBonus(stat) {
                if (!this.party || !stat || stat === 'hp' || stat === 'damage') return 0;

                // 檢查是否學習了「集團戰略」
                const skillId = 'tribe_01';
                if (!this.learnedSkills || !this.learnedSkills[skillId]) {
                    return 0; // 如果沒學，就沒有任何加成
                }

                // 獲取技能資料和當前等級
                const skillData = SKILL_TREES.combat.find(s => s.id === skillId);
                if (!skillData) return 0; // 安全檢查

                const currentLevel = this.learnedSkills[skillId];
                const skillLevelData = skillData.levels[currentLevel - 1];
                if (!skillLevelData) return 0; // 安全檢查

                // 計算夥伴提供的基礎能力總和
                const totalBonusFromParty = this.party.reduce((sum, p) => sum + (p.stats[stat] || 0), 0);
                
                // 返回被動效果的百分比加成
                return Math.floor(totalBonusFromParty * skillLevelData.passive);
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

            getEffectiveEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                
                const totalStat = this.getTotalStat(stat, this.isStarving);
                
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);
                baseValue += this.getAffixEffect(stat).bonus;
                baseValue -= this.getAffixPenalty(); // Subtract the penalty here
                
                const effectiveBonus = totalStat - baseValue;

                return Math.round(effectiveBonus);
            }

            getAffixEffect(stat) {
                const bonus = { bonus: 0 };
                if (!this.equipment) return bonus;

                // 重新計算基礎值為0的屬性，這是判斷詛咒生效的關鍵
                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);

                // 遍歷所有已裝備的物品
                Object.values(this.equipment).forEach(item => {
                    if (!item || !item.specialAffix) return;

                    switch (item.specialAffix) {
                        // 詛咒單一屬性的裝備
                        case 'strength_curse':
                            if (zeroStats.includes('strength')) {
                                if (stat === 'strength') bonus.bonus += 10;
                            }
                            break;
                        case 'agility_curse':
                            if (zeroStats.includes('agility')) {
                                if (stat === 'agility') bonus.bonus += 10;
                            }
                            break;
                        case 'intelligence_curse':
                            if (zeroStats.includes('intelligence')) {
                                if (stat === 'intelligence') bonus.bonus += 10;
                            }
                            break;
                        case 'luck_curse':
                            if (zeroStats.includes('luck')) {
                                if (stat === 'luck') bonus.bonus += 10;
                            }
                            break;
                        // 肛蛋詛咒
                        case 'gundam_curse':
                            if (zeroStats.length === 2) {
                                if (zeroStats.includes(stat)) {
                                    bonus.bonus += 8;
                                }
                            }
                            break;
                        // 變身詛咒
                        case 'henshin_curse':
                            if (zeroStats.length === 3) {
                                if (zeroStats.includes(stat)) {
                                    bonus.bonus += 5;
                                }
                            }
                            break;
                    }
                });

                return bonus;
            }

            getAffixPenalty() {
                let penalty = 0;
                if (!this.equipment) return penalty;

                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);
                
                Object.values(this.equipment).forEach(item => {
                    if (!item || !item.specialAffix) return;

                    switch (item.specialAffix) {
                        case 'strength_curse':
                            if (!zeroStats.includes('strength')) penalty += 10;
                            break;
                        case 'agility_curse':
                            if (!zeroStats.includes('agility')) penalty += 10;
                            break;
                        case 'intelligence_curse':
                            if (!zeroStats.includes('intelligence')) penalty += 10;
                            break;
                        case 'luck_curse':
                            if (!zeroStats.includes('luck')) penalty += 10;
                            break;
                        case 'gundam_curse':
                            if (zeroStats.length !== 2) penalty += 8;
                            break;
                        case 'henshin_curse':
                            if (zeroStats.length !== 3) {
                                penalty += 5;
                            }
                            break;
                    }
                });

                return penalty;
            }

            getSpecialAffixModifier(stat) {
                const modifier = { bonus: 0, penalty: 0 };
                if (!this.equipment) return modifier;

                const zeroStats = Object.keys(this.stats).filter(s => ['strength', 'agility', 'intelligence', 'luck'].includes(s) && this.stats[s] === 0);

                Object.values(this.equipment).forEach(item => {
                    if (!item || !item.specialAffix) return;

                    switch (item.specialAffix) {
                        case 'strength_curse':
                            if (zeroStats.includes('strength')) {
                                if (stat === 'strength') modifier.bonus += 10;
                            } else {
                                modifier.penalty += 10;
                            }
                            break;
                        case 'agility_curse':
                            if (zeroStats.includes('agility')) {
                                if (stat === 'agility') modifier.bonus += 10;
                            } else {
                                modifier.penalty += 10;
                            }
                            break;
                        case 'intelligence_curse':
                            if (zeroStats.includes('intelligence')) {
                                if (stat === 'intelligence') modifier.bonus += 10;
                            } else {
                                modifier.penalty += 10;
                            }
                            break;
                        case 'luck_curse':
                            if (zeroStats.includes('luck')) {
                                if (stat === 'luck') modifier.bonus += 10;
                            } else {
                                modifier.penalty += 10;
                            }
                            break;
                        case 'gundam_curse':
                            if (zeroStats.length === 2) {
                                if (zeroStats.includes(stat)) modifier.bonus += 8;
                            } else {
                                modifier.penalty += 8;
                            }
                            break;
                        case 'henshin_curse':
                            if (zeroStats.length === 3) {
                                if (zeroStats.includes(stat)) modifier.bonus += 5;
                            } else {
                                modifier.penalty += 5;
                            }
                            break;
                    }
                });

                return modifier;
            }

            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck'].includes(stat)) {
                    return 0;
                }

                // 1. 基礎值 = 自身原始值 + 夥伴加成
                let baseValue = this.stats[stat] + this.getPartyBonus(stat);

                // 2. 固定加成值 = 裝備基礎屬性 + 詞綴固定加成 + 特殊詛咒裝備效果 (正負)
                let flatBonus = this.getEquipmentBonus(stat);

                // --- 加入標準詞綴的固定加成 ---
                Object.values(this.equipment).forEach(item => {
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

                // 加入特殊詛咒裝備效果
                const specialAffixMod = this.getSpecialAffixModifier(stat);
                flatBonus += specialAffixMod.bonus - specialAffixMod.penalty;

                // 3. 百分比乘積 = 所有標準詞綴的乘法效果疊乘
                let multiplier = 1.0; // <--- 確保這一行存在
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
                const totalStr = this.getTotalStat('strength', isStarving);
                const totalAgi = this.getTotalStat('agility', isStarving);
                const totalInt = this.getTotalStat('intelligence', isStarving);
                const totalLuc = this.getTotalStat('luck', isStarving);

                let maxHp = this.getBaseMaxHp(isStarving) + 
                this.getPartyHpBonus(isStarving) + 
                this.getEquipmentHpBonus();
                
                // --- START OF ADDED CODE ---
                // Apply HP multipliers from standard affixes
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
                // --- END OF ADDED CODE ---

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

                // 如果最大生命值是增加的，且之前是滿血狀態，則直接補滿當前生命值
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
                // 步驟 1: 呼叫父類別的通用傷害計算方法來取得基礎傷害
                let finalDamage = super.calculateDamage(isStarving);

                // 步驟 2: 檢查並應用來自任何屬性攻擊技能的強化效果
                if (this.activeSkillBuff) {
                    // 從 buff 中讀取要使用的屬性，預設為力量
                    const statToUse = this.activeSkillBuff.stat || 'strength';
                    // 取得該屬性的總值
                    const totalStatValue = this.getTotalStat(statToUse, isStarving);
                    // 計算額外傷害
                    const bonusDamage = Math.floor(totalStatValue * this.activeSkillBuff.multiplier);
                    
                    finalDamage += bonusDamage;
                    
                    // 套用後立即清除 buff，確保它只生效一次
                    this.activeSkillBuff = null; 
                }
                
                // 步驟 3: 返回最終計算結果
                return finalDamage;
            }
        }
        
        class Human extends Unit {
            constructor(name, stats, profession) {
                super(name, stats, profession);
                // 初始化裝備欄位
                this.equipment = {
                    mainHand: null,
                    offHand: null,
                    chest: null,
                };
            }

            // 從 Goblin 類別複製過來的函式
            getEquipmentBonus(stat) {
                if (!this.equipment) return 0;
                return Object.values(this.equipment).reduce((sum, item) => {
                    return sum + (item && item.stats && item.stats[stat] ? item.stats[stat] : 0);
                }, 0);
            }

            getTotalStat(stat, isStarving = false) {
                if (stat === 'hp') return this.calculateMaxHp(isStarving);
                if (!this.stats.hasOwnProperty(stat) || !['strength', 'agility', 'intelligence', 'luck'].includes(stat)) {
                    return 0;
                }

                // 基礎值 (只計算自身)
                let baseValue = this.stats[stat];

                // 固定加成值 (只計算裝備)
                let flatBonus = this.getEquipmentBonus(stat);

                let total = baseValue + flatBonus;
                total = Math.max(0, total);

                // 敵人不受飢餓影響，但保留 isStarving 參數以維持函式簽名一致
                return isStarving ? Math.floor(total * 0.75) : total;
            }

            // 一個簡易版的 updateHp
            updateHp(isStarving = false) {
                const oldMaxHp = this.maxHp;
                this.maxHp = this.calculateMaxHp(isStarving);
                const hpPercentage = oldMaxHp > 0 ? this.currentHp / oldMaxHp : 1;
                this.currentHp = Math.round(this.maxHp * hpPercentage);
            }
        }
        
        class FemaleHuman extends Human {
             // 確保 constructor 的參數列表包含了 originDifficulty
            constructor(name, stats, profession, visual, originDifficulty = 'easy') { 
                super(name, stats, profession);
                this.visual = visual;
                this.isPregnant = false;
                this.pregnancyTimer = 0;
                this.isMother = false;
                // 這一行現在可以正確地從參數接收 originDifficulty
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
            constructor(name, stats, profession, originDifficulty = 'easy') { 
                super(name, stats, profession);
                this.originDifficulty = originDifficulty; 
                this.maxHp = this.calculateMaxHp();
                this.currentHp = this.maxHp;
            }
            calculateMaxHp() {
                const { strength, agility, intelligence, luck } = this.stats;
                return (strength + agility + intelligence + luck) * 5;
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