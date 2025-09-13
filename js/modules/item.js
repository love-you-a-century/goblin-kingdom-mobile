// js/modules/item.js

const itemModule = {
    calculateEquipmentValue(item) {
        if (!item) return 0;
        let baseValue = 0;
        let nativeStatValue = 0;
        let qualityValue = 0;
        let affixValue = 0;

        if (item.material && item.material.tier) {
            const tier = item.material.tier;
            const cost = CRAFTING_COSTS[tier];
            if (cost) {
                baseValue = (cost.food || 0) + (cost.wood || 0) + (cost.stone || 0);
            }
        }

        const stats = item.stats || {};
        if (stats.allStats) {
            nativeStatValue += (stats.allStats * 4 * 6) * 2;
        }
        if (stats.attackBonus) {
            nativeStatValue += (stats.attackBonus * 6) * 2;
        }
        if (stats.damage) {
            nativeStatValue += (stats.damage * 6) * 2;
        }
        if (stats.damageReduction) {
            nativeStatValue += stats.damageReduction * 10;
        }
        if (item.baseName === '盾') {
            const blockTarget = stats.blockTarget || 20;
            const blockChancePercent = (20 - blockTarget) * 5;
            const blockChanceValue = blockChancePercent * 10;
            const damageReductionValue = 250; 
            nativeStatValue += blockChanceValue + damageReductionValue;
            if (stats.attackBonus) {
                nativeStatValue += (stats.attackBonus * 6) * 2;
            }
        } else {
            if (stats.allStats) nativeStatValue += (stats.allStats * 4 * 6) * 2;
            if (stats.attackBonus) nativeStatValue += (stats.attackBonus * 6) * 2;
            if (stats.damage) nativeStatValue += (stats.damage * 6) * 2;
            if (stats.damageReduction) nativeStatValue += stats.damageReduction * 10;
        }

        if (item.qualityBonus) {
            qualityValue = item.qualityBonus * 10;
        }

        if (item.affixes && item.affixes.length > 0) {
            let calculatedAffixValue = 0;
            item.affixes.forEach(affix => {
                let singleAffixValue = 0;
                if (affix.type === 'stat') {
                    affix.effects.forEach(effect => {
                        if (['strength', 'agility', 'intelligence', 'luck'].includes(effect.stat)) singleAffixValue += (effect.value * 6) * 2;
                        else if (effect.stat === 'all') singleAffixValue += (effect.value * 4 * 6) * 2;
                        else if (effect.stat === 'hp') singleAffixValue += effect.value;
                    });
                }
                else if (affix.type === 'weapon_damage') {
                    affix.effects.forEach(effect => {
                        const percentage = effect.multiplier * 100;
                        singleAffixValue += 2 * 6 * percentage;
                    });
                }
                else if (affix.type === 'proc') {
                    const procInfo = affix.procInfo;
                    switch(affix.key) {
                        case 'vampiric': singleAffixValue += procInfo.baseRate * 10 * 3; break;
                        case 'spiky': singleAffixValue += procInfo.baseRate * 10 * 6; break;
                        case 'multi_hit': singleAffixValue += procInfo.baseRate * 10 * 6; break;
                        case 'regenerating': singleAffixValue += (procInfo.value * 100) * 100; break;
                        case 'blocking': singleAffixValue += procInfo.baseRate * 10 * 6 * 2; break;
                        case 'penetrating': singleAffixValue += procInfo.baseRate * 10 * 6; break;
                    }
                } 
                else if (affix.key === 'devastating') {
                    singleAffixValue += 50 * 6 * 2;
                }
                calculatedAffixValue += Math.max(0, singleAffixValue);
            });
            affixValue = calculatedAffixValue;
        }

        const totalValue = baseValue + nativeStatValue + qualityValue + affixValue;
        return Math.max(1, Math.floor(totalValue));
    },

    craftItem() {
        if (!this.canAffordCraft) {
            this.showCustomAlert('資源不足！');
            return;
        }
        if (this.player.inventory.length >= this.backpackCapacity) {
            this.showCustomAlert('你的背包已滿，無法製作新裝備！');
            return;
        }
        
        const typeName = this.modals.armory.craftingType;
        const tier = this.modals.armory.craftingTier;

        const craftableInfo = this.craftableTypes.find(t => t.baseName === typeName);
        if (!craftableInfo) return;
        const category = craftableInfo.materialCategory;

        const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => {
            const mat = EQUIPMENT_MATERIALS[key];
            return mat.tier === tier && mat.category === category;
        });

        if (!materialKey) {
            this.showCustomAlert('發生內部錯誤，找不到對應的材質！');
            return;
        }
        
        const cost = this.getCraftingCost();
        this.resources.food -= cost.food;
        this.resources.wood -= cost.wood;
        this.resources.stone -= cost.stone;

        const roll = randomInt(1, 100);
        let qualityKey = 'worn';
        if (roll <= 5) qualityKey = 'legendary';
        else if (roll <= 15) qualityKey = 'epic';
        else if (roll <= 32) qualityKey = 'rare';
        else if (roll <= 58) qualityKey = 'uncommon';
        else if (roll <= 93) qualityKey = 'common';

        const newItem = this.createEquipment(materialKey, qualityKey, typeName);

        this.player.inventory.push(newItem);
        this.logMessage('tribe', `你花費 食物x${cost.food}, 木材x${cost.wood}, 礦石x${cost.stone} 成功製作了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');
        this.showCustomAlert(`製作成功！\n你獲得了 [${newItem.name}]`);
    },

    decomposeItem(itemId) {
        if (this.buildings.armory.level === 0) {
            this.showCustomAlert('你需要先建造兵工廠才能分解裝備！');
            return;
        }
        let itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        let sourceArray = this.player.inventory;
        if (itemIndex === -1) {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            sourceArray = this.warehouseInventory;
        }
        if (itemIndex === -1) return;

        const item = sourceArray[itemIndex];
        const tier = item.material.tier;
        const originalCost = CRAFTING_COSTS[tier];
        if (!originalCost) return;

        const returnRate = [0.2, 0.3, 0.4, 0.5][this.buildings.armory.level - 1] || 0;
        
        const foodBack = Math.floor(originalCost.food * returnRate);
        const woodBack = Math.floor(originalCost.wood * returnRate);
        const stoneBack = Math.floor(originalCost.stone * returnRate);

        this.resources.food += foodBack;
        this.resources.wood += woodBack;
        this.resources.stone += stoneBack;

        this.logMessage('tribe', `你分解了 [${item.name}]，回收了食物x${foodBack}, 木材x${woodBack}, 礦石x${stoneBack}。`, 'info');

        sourceArray.splice(itemIndex, 1);
    },

    openDiscardConfirm(itemId) {
        const item = this.player.inventory.find(i => i.id === itemId) || this.warehouseInventory.find(i => i.id === itemId);
        if (item) {
            this.modals.discardConfirm.itemId = itemId;
            this.modals.discardConfirm.itemName = item.name;
            this.modals.discardConfirm.isOpen = true;
        }
    },

    executeDiscardItem() {
        const itemId = this.modals.discardConfirm.itemId;
        let itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            const itemName = this.player.inventory[itemIndex].name;
            this.player.inventory.splice(itemIndex, 1);
            this.logMessage('tribe', `你從背包丟棄了 [${itemName}]。`, 'info');
        } else {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            if (itemIndex > -1) {
                const itemName = this.warehouseInventory[itemIndex].name;
                this.warehouseInventory.splice(itemIndex, 1);
                this.logMessage('tribe', `你從倉庫丟棄了 [${itemName}]。`, 'info');
            }
        }
        this.modals.discardConfirm.isOpen = false;
        this.modals.discardConfirm.itemId = null;
        this.modals.discardConfirm.itemName = '';
    },

    equipItem(itemId, targetUnit) {
        if (!targetUnit) return;
        let itemIndex = -1;
        let sourceArray = null;

        itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        sourceArray = this.player.inventory;

        if (itemIndex === -1 && this.screen !== 'raid') {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            sourceArray = this.warehouseInventory;
        }

        if (itemIndex === -1) return;

        const itemToEquip = sourceArray[itemIndex];
        let slot = itemToEquip.slot; 
        const mainHandWeapon = targetUnit.equipment.mainHand;
        const offHandItem = targetUnit.equipment.offHand;
        
        const dualWieldableWeapons = [...ONE_HANDED_DUAL_WIELD_WEAPONS, ...LIGHT_DUAL_WIELD_WEAPONS];
        if (dualWieldableWeapons.includes(itemToEquip.baseName) && 
            mainHandWeapon && 
            dualWieldableWeapons.includes(mainHandWeapon.baseName) && 
            !offHandItem) {
                
            if (!this.dlc.hells_knights) { // 假設雙持能力都由這個DLC解鎖
                this.showCustomAlert('需要「王國騎士團」DLC 才能雙持武器！');
                return;
            }
        }
        if (itemToEquip.baseName === '盾' && mainHandWeapon && ['長槍', '法杖'].includes(mainHandWeapon.baseName)) {
            if (!this.dlc.hells_knights) {
                this.showCustomAlert('需要「王國騎士團」DLC 才能將長槍或法杖與盾牌搭配使用！');
                return;
            }
        }
        if (['長槍', '法杖'].includes(itemToEquip.baseName) && offHandItem?.baseName === '盾') {
            if (!this.dlc.hells_knights) {
                this.showCustomAlert('需要「王國騎士團」DLC 才能將長槍或法杖與盾牌搭配使用！');
                return;
            }
        }
        if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName === '劍' && !targetUnit.equipment.offHand) {
            slot = 'offHand';
        }
        if (!slot || !targetUnit.equipment.hasOwnProperty(slot)) return;
        if (slot === 'offHand') {
            if (mainHandWeapon && TWO_HANDED_WEAPONS.includes(mainHandWeapon.baseName)) {
                this.showCustomAlert(`裝備 ${mainHandWeapon.name} 時無法使用副手裝備！`);
                return;
            }
            if (!mainHandWeapon) {
                this.showCustomAlert('必須先裝備主手武器，才能裝備副手武器！');
                return;
            }
        }
        if (slot === 'mainHand' && TWO_HANDED_WEAPONS.includes(itemToEquip.baseName)) {
            if (targetUnit.equipment.offHand) {
                this.logMessage('tribe', `裝備雙手武器時自動卸下了 ${targetUnit.equipment.offHand.name}。`, 'info');
                this.unequipItem('offHand', targetUnit, true);
            }
        }
        if (targetUnit.equipment[slot]) {
            this.unequipItem(slot, targetUnit, true);
        }

        targetUnit.equipment[slot] = itemToEquip;
        sourceArray.splice(itemIndex, 1);
        
        if (targetUnit.updateHp) targetUnit.updateHp(this.isStarving);
        this.logMessage(this.screen === 'raid' ? 'raid' : 'tribe', `${targetUnit.name} 裝備了 <span style="color:${itemToEquip.quality.color};">[${itemToEquip.name}]</span>。`, 'success');
    },

    unequipItem(slot, targetUnit, silent = false) {
        if (!targetUnit || !targetUnit.equipment[slot]) return;
        
        const itemToUnequip = targetUnit.equipment[slot];

        if (this.screen === 'raid') {
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.showCustomAlert('你的背包已滿，無法卸下裝備！');
                return;
            }
            this.player.inventory.push(itemToUnequip);
            if (!silent) {
                this.logMessage('raid', `${targetUnit.name} 卸下了 <span style="color:${itemToUnequip.quality.color};">[${itemToUnequip.name}]</span>，物品已放入背包。`, 'info');
            }
        } else {
            if (this.warehouseInventory.length >= this.warehouseCapacity) {
                this.showCustomAlert('倉庫已滿，無法卸下裝備！');
                return;
            }
            this.warehouseInventory.push(itemToUnequip);
            if (!silent) {
                this.logMessage('tribe', `${targetUnit.name} 卸下了 <span style="color:${itemToUnequip.quality.color};">[${itemToUnequip.name}]</span>，物品已存入倉庫。`, 'info');
            }
        }
        
        targetUnit.equipment[slot] = null;

        if (targetUnit.updateHp) {
            targetUnit.updateHp(this.isStarving);
        } else if (targetUnit.id === this.player.id) { 
            this.player.updateHp(this.isStarving);
        }
    },

    moveToBackpack(itemId) {
        const itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.showCustomAlert('你的背包已滿！');
                return;
            }
            const [item] = this.warehouseInventory.splice(itemIndex, 1);
            this.player.inventory.push(item);
        }
    },

    moveToWarehouse(itemId) {
        const itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex > -1) {
            if (this.warehouseInventory.length >= this.warehouseCapacity) {
                this.showCustomAlert('倉庫已滿！');
                return;
            }
            const [item] = this.player.inventory.splice(itemIndex, 1);
            this.warehouseInventory.push(item);
        }
    },

    getItemStatsString(item) {
        if (!item) return '';
        let parts = [];
        let baseStatParts = [];

        if (item.qualityBonus !== 0) {
            const bonusText = item.qualityBonus > 0 ? `+${item.qualityBonus}` : item.qualityBonus;
            let bonusName = '';
            if (item.type === 'armor' || item.baseName === '盾') bonusName = '迴避加成';
            else if (item.type === 'weapon') bonusName = '命中加成';
            if (bonusName) baseStatParts.push(`${bonusName}: ${bonusText}`);
        }
        
        if (item.stats && Object.keys(item.stats).length > 0) {
            const formattedBaseStats = Object.entries(item.stats).map(([key, value]) => {
                const nameMap = { damage: '傷害', attackBonus: '傷害', damageReduction: '傷害減免', allStats: '全屬性', blockTarget: '格擋目標值' };
                const unitMap = { damageReduction: '%' };
                return `${nameMap[key] || key} +${value}${unitMap[key] || ''}`;
            });
            baseStatParts.push(...formattedBaseStats);
        }

        if (baseStatParts.length > 0) {
            parts.push(`<span class="text-cyan-400">${baseStatParts.join(', ')}</span>`);
        }
        
        item.affixes.forEach(affix => {
            if (affix.type === 'stat') {
                const effectString = affix.effects.map(e => {
                    const statName = e.stat === 'all' ? '全能力' : (STAT_NAMES[e.stat] || e.stat);
                    const valueString = e.value > 0 ? `+${e.value}` : e.value;
                    return e.type === 'multiplier' ? `${statName} x${e.value}` : `${statName} ${valueString}`;
                }).join(' / ');
                parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);

            } else if (affix.type === 'proc') {
                const procDescMap = {
                    'vampiric': `(10%機率恢復我方造成${affix.procInfo.value * 100}%傷害)`,
                    'spiky': `(${affix.procInfo.value * 100}%機率反彈10%傷害)`,
                    'multi_hit': '(5%機率連擊)',
                    'regenerating': `(每回合恢復${affix.procInfo.value * 100}%生命)`,
                    'blocking': '(5%機率無效攻擊)',
                    'penetrating': `(10%機率給予目標${affix.procInfo.value * 100}%傷害)`
                };
                const procDesc = procDescMap[affix.key] || '(機率性效果)';
                parts.push(`<span class="text-blue-400">${affix.name} ${procDesc}</span>`);
            } else if (affix.type === 'weapon_damage') {
                const effect = affix.effects[0];
                if (effect) {
                    const statName = STAT_NAMES[effect.stat] || effect.stat;
                    const percentage = effect.multiplier * 100;
                    const effectString = `傷害+${percentage}%有效${statName}`;
                    parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);
                }
            } else if (affix.type === 'proc_rate_enhancer') {
                const effect = affix.effects;
                if (effect) {
                    const effectString = `詞綴發動率+${effect.value}%`;
                    parts.push(`<span class="text-blue-400">${affix.name}: ${effectString}</span>`);
                }
            }else if (affix.type === 'crit_mod') {
                const effect = affix.effects;
                if (effect && effect.crit_damage_bonus) {
                    const percentage = effect.crit_damage_bonus * 100;
                    const effectString = `爆擊傷害+${percentage}%`;
                    parts.push(`<span class="text-yellow-400">${affix.name}: ${effectString}</span>`);
                }
            }
            else if (affix.type === 'crit_chance') {
                const effect = affix.effects;
                if (effect && effect.value) {
                    const effectString = `爆擊機率+${effect.value}%`;
                    parts.push(`<span class="text-yellow-400">${affix.name}: ${effectString}</span>`);
                }
            }
        });

        if (item.specialAffix) {
            const affixDesc = {
                'strength_curse': '脫力(基礎力=0時+30力, 否則全能力-30)', 'agility_curse': '遲鈍(基礎敏=0時+30敏, 否則全能力-30)',
                'intelligence_curse': '愚鈍(基礎智=0時+30智, 否則全能力-30)', 'luck_curse': '不幸(基礎運=0時+30運, 否則全能力-30)',
                'gundam_curse': '肛蛋(基礎2項=0時, 該2項+15, 否則全能力-15)', 'henshin_curse': '變身(基礎3項=0時, 該3項+10, 否則全能力-10)',
            }[item.specialAffix] || '';
            if (affixDesc) parts.push(`<span class="text-red-400">${affixDesc}</span>`);
        }

        return parts.join('<br>');
    },
};