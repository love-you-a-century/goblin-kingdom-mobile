// js/modules/unitManager.js

const unitManagerModule = {
    releaseCaptive(captiveId) {
        const captive = this.captives.find(c => c.id === captiveId);
        if (captive) {
            this.captives = this.captives.filter(c => c.id !== captiveId);
            this.logMessage('tribe', `你拋棄了 ${captive.isMother ? '孕母' : '俘虜'} ${captive.name}。`, 'info');
        }
    },

    moveMotherToDungeon(captiveId) {
        const captive = this.captives.find(c => c.id === captiveId);
        if (captive) {
            if (captive.isPregnant) {
                this.showCustomAlert(`${captive.name} 正在懷孕中，無法移動！`);
                return;
            }
            if (this.dungeonCaptives.length >= this.captiveCapacity) {
                this.showCustomAlert(`地牢空間已滿 ( ${this.dungeonCaptives.length} / ${this.captiveCapacity} )，無法移入更多俘虜！`);
                return;
            }
            captive.isMother = false;
            this.logMessage('tribe', `${captive.name} 已被移回地牢，等待繁衍。`, 'info');
        }
    },

    _removePartnerFromAllAssignments(partnerId) {
        this.player.party = this.player.party.filter(p => p.id !== partnerId);
        Object.keys(this.dispatch).forEach(task => {
            this.dispatch[task] = this.dispatch[task].filter(id => id !== partnerId);
        });
    },

    assignPartner(partnerId, task) {
        this._removePartnerFromAllAssignments(partnerId);

        if (task === 'party') {
            const partner = this.partners.find(p => p.id === partnerId);
            if (partner && this.player.party.length < 20) {
                this.player.party.push(partner);
            }
        } else if (this.dispatch[task]) {
            if (task === 'watchtower') {
                if (this.dispatch.watchtower.length < 5) {
                    this.dispatch.watchtower.push(partnerId);
                }
            } else if (this.dispatch[task].length < 10) {
                this.dispatch[task].push(partnerId);
            }
        }
        
        this.player.updateHp(this.isStarving);
    },

    _finalizePartnerRemoval(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;
        const partnerName = partner.name || '一名夥伴';

        this._removePartnerFromAllAssignments(partnerId);
        this.partners = this.partners.filter(p => p.id !== partnerId);
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你將 ${partnerName} 逐出了部落。`, 'info');
    },

    releasePartner(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;

        const itemsToReturn = Object.values(partner.equipment).filter(item => item !== null);
        
        if (itemsToReturn.length > 0) {
            const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
            
            if (itemsToReturn.length > availableSpace) {
                this.modals.itemManagement = {
                    isOpen: true,
                    title: `處理 ${partner.name} 的裝備`,
                    message: `倉庫與背包空間不足！請先處理以下裝備，直到剩餘數量小於等於 ${availableSpace}。`,
                    items: [...itemsToReturn],
                    capacity: availableSpace,
                    onConfirm: () => this._finalizePartnerRemoval(partnerId) 
                };
                return;
            } else {
                itemsToReturn.forEach(item => {
                    if (this.warehouseInventory.length < this.warehouseCapacity) {
                        this.warehouseInventory.push(item);
                    } else {
                        this.player.inventory.push(item);
                    }
                });
                this.logMessage('tribe', `已將 ${partner.name} 的 ${itemsToReturn.length} 件裝備自動移至倉庫/背包。`, 'info');
            }
        }
        
        this._finalizePartnerRemoval(partnerId);
    },

    removeAllCaptives(reason) {
        if (this.captives.length === 0) return;
        const specialProfessions = ['魅魔', '女神', '使徒'];

        if (reason === 'rescued') {
            const rescuedCaptives = this.captives.filter(c => !specialProfessions.includes(c.profession));
            const rescuedCount = rescuedCaptives.length;

            if (rescuedCount > 0) {
                this.logMessage('tribe', `復仇小隊趁亂將你的 ${rescuedCount} 名俘虜救走了！`, 'enemy');
            } else {
                this.logMessage('tribe', `復仇小隊試圖解救俘虜，但特殊俘虜拒絕離開。`, 'info');
            }
        }
        
        this.captives = this.captives.filter(c => specialProfessions.includes(c.profession));
    },

    confirmPartySelection() {
        this.player.party = [];
        this.modals.barracks.selectedPartyIds.forEach(id => {
            this.assignPartner(id, 'party');
        });
        
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你更新了出擊隊伍，現在有 ${this.player.party.length} 名夥伴與你同行。`, 'info');
        this.showCustomAlert('出擊隊伍已更新！');
    },
                    
    addTempPoint(stat) {
        const spentPoints = Object.values(this.tempStatIncreases).reduce((a, b) => a + b, 0);
        if (this.player.attributePoints > spentPoints) {
            this.tempStatIncreases[stat]++;
        }
    },

    confirmAttributePoints() {
        let changesLog = [];
        for (const stat in this.tempStatIncreases) {
            if (this.tempStatIncreases[stat] > 0) {
                const increase = this.tempStatIncreases[stat];
                this.player.stats[stat] += increase;
                this.player.attributePoints -= increase;
                changesLog.push(`${STAT_NAMES[stat]} +${increase}`);
            }
        }
        this.cancelAttributePoints();
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你分配了能力點：${changesLog.join(', ')}。`, 'success');
    },

    cancelAttributePoints() {
        this.tempStatIncreases = { strength: 0, agility: 0, intelligence: 0, luck: 0 };
    },

    openCaptiveManagementModal(type, list, limit, dungeonLimit = -1, context = null) {
        const modal = this.modals.captiveManagement;
        modal.type = type;
        modal.list = list;
        modal.limit = limit;
        modal.dungeonLimit = dungeonLimit;
        modal.context = context;

        if (type === 'raid') {
            modal.title = '攜帶量已滿';
            modal.selectedIds = list.slice(0, limit).map(c => c.id);
        } else if (type === 'partner') {
            modal.title = '寢室空間不足';
            modal.selectedIds = list.filter(p => p.id !== context.newborn.id).map(p => p.id);
        } else {
            modal.title = '地牢已滿';
            modal.selectedIds = list.filter(c => this.captives.some(existing => existing.id === c.id)).map(c => c.id);
        }

        if (dungeonLimit > -1) {
            let selectedDungeonCaptives = modal.list.filter(c => modal.selectedIds.includes(c.id) && !c.isPregnant && !c.isMother);
            while (selectedDungeonCaptives.length > dungeonLimit) {
                const captiveToRemove = selectedDungeonCaptives.pop();
                modal.selectedIds = modal.selectedIds.filter(id => id !== captiveToRemove.id);
            }
        }
        modal.isOpen = true;
    },

    confirmCaptiveSelection() {
        const modal = this.modals.captiveManagement;
        const selectedIds = new Set(modal.selectedIds);

        // 修正俘虜計算邏輯，新的俘虜名單，應該只包含從本次管理介面的「總列表」中，被勾選的那些。
        const keptCaptives = modal.list.filter(c => selectedIds.has(c.id));
        this.captives = keptCaptives; // 直接用篩選後的結果，覆蓋掉舊的俘虜名單

        if (modal.type === 'raid_return') {
            // 掠奪返回後的處理
            this.logMessage('tribe', `你整理了地牢，最終留下了 ${this.captives.length} 名俘虜。`, 'success');
            this.finalizeRaidReturn();
        } else if (modal.type === 'dungeon') { 
            // 部落防衛戰後的處理
            this.logMessage('tribe', `你整理了地牢，最終留下了 ${this.captives.length} 名俘虜。`, 'success');
            // 移除錯誤的函式呼叫，此處不需要呼叫任何函式，我們建立的事件系統會在視窗關閉後自動處理下一個事件。
        }

        modal.isOpen = false;
    },

    openPartnerManagementModal(list, limit, context) {
        const modal = this.modals.partnerManagement;
        modal.list = list;
        modal.limit = limit;
        modal.context = context;
        modal.newbornId = context.newborns.map(nb => nb.newborn.id);
        const newbornIdSet = new Set(modal.newbornId);
        modal.selectedIds = list.filter(p => !newbornIdSet.has(p.id)).map(p => p.id);
        modal.isOpen = true;
    },

    confirmPartnerSelectionDecision() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        
        const discardedPartners = modal.list.filter(p => !selectedSet.has(p.id));
        const itemsToReturn = discardedPartners.flatMap(p => Object.values(p.equipment).filter(item => item !== null));
        const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
        
        if (itemsToReturn.length > availableSpace) {
            this.modals.itemManagement = {
                isOpen: true,
                title: `處理被放棄夥伴的裝備`,
                message: `為新生兒騰出空間前，需先處理被放棄夥伴身上的裝備。請先處理以下物品，直到剩餘數量小於等於 ${availableSpace}。`,
                items: [...itemsToReturn],
                capacity: availableSpace,
                onConfirm: () => {
                    this.confirmPartnerSelectionDecision();
                }
            };
            modal.isOpen = false;
            return;
        }
        this.finalizePartnerSelection();
    },

    finalizePartnerSelection() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        const allNewbornsContext = modal.context.newborns;
        const wasFromRaidReturn = modal.context?.fromRaidReturn;

        const discardedPartners = modal.list.filter(p => !selectedSet.has(p.id));
        discardedPartners.forEach(p => {
            this.releasePartner(p.id);
        });

        this.partners = this.partners.filter(p => selectedSet.has(p.id));
        
        const keptNewborns = allNewbornsContext.filter(ctx => selectedSet.has(ctx.newborn.id));

        if (keptNewborns.length > 0) {
            keptNewborns.forEach(ctx => {
                this.partners.push(ctx.newborn);
                this.player.skillPoints++;
                this.logMessage('tribe', `你為 ${ctx.newborn.name} 在寢室中騰出了空間！你獲得了 1 點技能點。`, 'success');
            });
        }
        
        const discardedNewborns = allNewbornsContext.filter(ctx => !selectedSet.has(ctx.newborn.id));
        if (discardedNewborns.length > 0) {
            const discardedNames = discardedNewborns.map(ctx => ctx.mother.name + "的孩子").join('、');
            this.logMessage('tribe', `你決定放棄 ${discardedNames}，為更強的夥伴保留了位置。`, 'info');
        }

        modal.isOpen = false;
        this.player.updateHp(this.isStarving);

        if (wasFromRaidReturn) {
            this.nextDay();
        }
    },

    cleanupDispatchLists() {
        const allCurrentPartnerIds = new Set(this.partners.map(p => p.id));
        this.dispatch.hunting = this.dispatch.hunting.filter(id => allCurrentPartnerIds.has(id));
        this.dispatch.logging = this.dispatch.logging.filter(id => allCurrentPartnerIds.has(id));
        this.dispatch.mining = this.dispatch.mining.filter(id => allCurrentPartnerIds.has(id));
        this.dispatch.watchtower = this.dispatch.watchtower.filter(id => allCurrentPartnerIds.has(id));
    },
    clearAllCombatStatusEffects() {
        if (!this.player) return;

        const allUnits = [this.player, ...this.partners];
        let effectsCleared = false;

        allUnits.forEach(unit => {
            if (unit.statusEffects && unit.statusEffects.length > 0) {
                unit.statusEffects = []; // 直接清空狀態效果陣列
                effectsCleared = true;
                // 清除後立即更新一次血量，以應用正確的計算公式
                if (unit.updateHp) {
                    unit.updateHp(this.isStarving);
                }
            }
        });

        if (effectsCleared) {
            this.logMessage('tribe', '所有戰鬥中的暫時狀態效果都已消散。', 'info');
        }
    },
};