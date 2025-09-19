// js/modules/ui.js

const uiModule = {
    handleConstructionClick() {
        this.modals.construction.isOpen = true;
    },

    handleRaidButtonClick() {
        const canRaid = this.buildings.dungeon.level > 0;
        if (canRaid) {
            this.screen = 'raid_selection';
        } else {
            this.showCustomAlert('必須先建造「地牢」，才能出擊！', () => {
                const isStuck = this.resources.food < 200 || this.resources.wood < 200 || this.resources.stone < 200;
                if (isStuck) {
                    this.handleBailoutRequest();
                }
            });
        }
    },

    openDispatchModal() {
        this.modals.dispatch.isOpen = true;
    },

    openSkillTree() {
        this.modals.skillTree.isOpen = true;
    },

    openMerchant() {
        this.updateMerchantDialogue();
        this.modals.merchant.isOpen = true;
    },

    updateMerchantDialogue() {
        if (this.merchant.goods.length === 0) {
            this.merchant.dialogue = this.NPCS.century.dialogues.no_goods;
        } else {
            this.merchant.dialogue = this.NPCS.century.dialogues.standard;
        }
    },

    getAdaArmoryDialogue() {
        if (this.flags.adaStatus !== 'friendly') {
            return ''; // 如果埃達不在，不顯示任何對話
        }
        // 如果保底計數器已經到了9，就顯示提示對話
        if (this.flags.adaCraftingCounter === 9) {
            return this.NPCS.ada.dialogues.armory_pity_close;
        }
        // 否則，顯示常規問候語
        return this.NPCS.ada.dialogues.armory_greeting;
    },

    executeTrade() {
        if (!this.canExecuteTrade) {
            this.showCustomAlert("交易條件不滿足！");
            return;
        }

        const tradedItems = this.selectedItems;
        const tradedItemIds = new Set(this.merchant.selectedItemIds);
        const tradedCaptiveIds = new Set(this.merchant.selectedCaptiveIds);

        const newItemsForPlayer = JSON.parse(JSON.stringify(tradedItems));
        newItemsForPlayer.forEach(item => item.id = crypto.randomUUID());
        this.player.inventory.push(...newItemsForPlayer);
        this.logMessage('tribe', `你用俘虜換來了 ${tradedItems.length} 件裝備！`, 'success');

        const tradedCaptives = this.captives.filter(c => tradedCaptiveIds.has(c.id));
        this.captives = this.captives.filter(c => !tradedCaptiveIds.has(c.id));
        this.logMessage('tribe', `你失去了 ${tradedCaptives.map(c => c.name).join(', ')} 這 ${tradedCaptives.length} 名俘虜。`, 'info');

        this.merchant.goods = this.merchant.goods.filter(g => !tradedItemIds.has(g.id));
        this.merchant.selectedItemIds = [];
        this.merchant.selectedCaptiveIds = [];

        if (this.merchant.goods.length === 0) {
            this.merchant.dialogue = this.NPCS.century.dialogues.sold_out;
            this.merchant.stayDuration = 1; 
            this.logMessage('tribe', '你買光了世紀的所有商品，她決定明天提早離開。', 'system');
        } else {
            this.merchant.dialogue = this.NPCS.century.dialogues.successful_trade;
            clearTimeout(this.merchantDialogueTimeout);
            this.merchantDialogueTimeout = setTimeout(() => {
                this.updateMerchantDialogue();
            }, 4000);
        }

        this.merchant.purchases++;
        if (this.merchant.purchases === 47) {
            const shijiClone = new FemaleHuman( '世紀的分身', { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: 147 }, '魅魔', { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' }, null);
            this.captives.push(shijiClone);
            this.showCustomAlert("「呵...你很懂『交易』嘛...。這個福利就送給你，哥布林王...」你發現一名特殊的魅魔出現在了你的地牢中！");
            this.logMessage('tribe', `你達成了與「世紀」的第47次交易，獲得了特殊俘虜 [世紀的分身]！`, 'system');
        }
    },

    redeemCode() {
        const code = this.$refs.dlc_code_input.value.trim().toUpperCase();
        if (!code) return;
        if (!this.player.redeemedCodes) this.player.redeemedCodes = [];

        if (this.player.redeemedCodes.includes(code)) {
            this.showCustomAlert('此序號已被使用。');
            this.$refs.dlc_code_input.value = '';
            return;
        }

        let success = false;
        let message = '兌換成功！';

        switch (code) {
            case "HELLKNIGHTS20147":
                this.dlc.hells_knights = true;
                message = '「王國騎士團」DLC 已成功啟用！';
                success = true;
                break;

            case "AETHERIA20147": // 假設我們的DLC兌換碼叫 AETHERIA
                if (this.dlc.races_of_aetheria) {
                    message = '你已啟用過此 DLC 內容。';
                    success = false;
                } else {
                    this.dlc.races_of_aetheria = true;
                    message = '「精靈與亞獸人」DLC 已成功啟用！';
                    success = true;
                }
                break;
            case "47SKILL":
                this.player.skillPoints += 47;
                message = '你獲得了 47 點技能點！';
                success = true;
                break;
            case "47STATS":
                this.player.attributePoints += 47;
                message = '你獲得了 47 點能力點！';
                success = true;
                break;
            case "NEEDPRINCESS":
                if (this.captives.length >= this.captiveCapacity) {
                    message = '地牢已滿，無法新增俘虜！';
                    success = false;
                } else {
                    const princessStats = { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: randomInt(140, 200) };
                    const princess = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], princessStats, '公主', generateVisuals(), null);
                    this.captives.push(princess);
                    message = `一位名叫 ${princess.name} 的公主出現在你的地牢中！`;
                    success = true;
                }
                break;
            case "HELLOCENTURY":
                if (this.captives.length >= this.captiveCapacity) {
                    message = '地牢已滿，無法新增俘虜！';
                    success = false;
                } else {
                    const shijiClone = new FemaleHuman('世紀的分身', { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: 147 }, '魅魔', { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' }, null);
                    this.captives.push(shijiClone);
                    message = '「世紀的分身」出現在你的地牢中！';
                    success = true;
                }
                break;
            default:
                message = '無效的序號。';
                success = false;
        }

        if (success) this.player.redeemedCodes.push(code);
        this.showCustomAlert(message);
        this.$refs.dlc_code_input.value = '';
    },

    loadMusic(event) {
        const file = event.target.files[0];
        if (file) {
            if (this.musicSettings.src) URL.revokeObjectURL(this.musicSettings.src);
            this.musicSettings.src = URL.createObjectURL(file);
            this.$refs.audioPlayer.src = this.musicSettings.src;
            this.musicSettings.isPlaying = true;
            this.$refs.audioPlayer.play().catch(e => {
                this.musicSettings.isPlaying = false;
            });
        }
    },

    toggleMusic() {
        if (!this.musicSettings.src) return;
        if (this.$refs.audioPlayer.paused) {
            this.$refs.audioPlayer.currentTime = 0;
            this.$refs.audioPlayer.play();
            this.musicSettings.isPlaying = true;
        } else {
            this.$refs.audioPlayer.pause();
            this.musicSettings.isPlaying = false;
        }
    },

    returnToBreedingModal(message) {
        this.screen = 'tribe';

        // 檢查是否有重大事件在佇列中
        const hasMajorEvent = this.pendingDecisions.some(d => d.type === 'apostle_battle' || d.type === 'goddess_battle');

        if (hasMajorEvent) {
            // 如果有，確保所有視窗都關閉，並直接處理事件
            this.modals.narrative.isOpen = false;
            this.modals.construction.isOpen = false;
            this.processNextDecision();
        } else {
            // 如果沒有，才執行返回建設視窗的原始邏輯
            this.modals.construction.isOpen = true;
            this.modals.construction.activeTab = 'dungeon';
            this.modals.dungeon.subTab = 'breed';
            this.showCustomAlert(message);
        }
    },

    openPlayerEquipment() {
        this.modals.partnerEquipment.partnerId = 'player';
        this.modals.partnerEquipment.isOpen = true;
    },

    openPartnerEquipment(partnerId) {
        this.modals.partnerEquipment.partnerId = partnerId;
        this.modals.partnerEquipment.isOpen = true;
    },

    showCustomAlert(message, onConfirmCallback = null) {
        this.modals.customAlert.message = message;
        this.modals.customAlert.onConfirm = onConfirmCallback;
        this.modals.customAlert.isOpen = true;
    },

    confirmCustomAlert() {
        this.modals.customAlert.isOpen = false;
        const callbackToExecute = this.modals.customAlert.onConfirm;
        this.modals.customAlert.onConfirm = null;
        if (typeof callbackToExecute === 'function') {
            setTimeout(() => {
                callbackToExecute();
            }, 100);
        }
    },

    handleBailoutRequest() {
        this.bailoutCounter++;
        const modal = this.modals.bailoutConfirm;
        let questions = ["世紀「你是否承認自己跳過新手教學很呆?」"];
        const extraQuestions = ["世紀「真的嗎?」", "世紀「你確定?」", "世紀「沒有一點遲疑?」", "世紀「好吧，既然你都說到這個份上了...」", "世紀「最後一次機會囉?」", "世紀「我是誰?先回答你是不是呆瓜比較重要」", "世紀「我是誰?你之後就知道了。所以你是呆瓜嗎?」", "世紀「嘿...你不是第一次對吧?」", "世紀「嘿...騙我的話，我會知道的。你是呆瓜嗎?」"];
        for (let i = 0; i < this.bailoutCounter; i++) {
            questions.push(extraQuestions[i % extraQuestions.length]);
        }
        modal.messages = questions;
        modal.currentMessageIndex = 0;
        modal.onConfirm = () => this.executeBailout();
        modal.isOpen = true;
    },

    executeBailout() {
        this.resources.food = 200;
        this.resources.wood = 200;
        this.resources.stone = 200;
        this.modals.bailoutConfirm.isOpen = false;
        setTimeout(() => {
            this.showCustomAlert('世紀「真是拿你沒辦法…資源已經恢復了。快去「部落建設」裡，優先建造「地牢」和「產房」吧！」');
        }, 100);
    },

    refuseBailout() {
        this.bailoutOfferedButRefused = true;
        this.modals.bailoutConfirm.isOpen = false;
    },

    confirmBailoutStep() {
        const modal = this.modals.bailoutConfirm;
        modal.currentMessageIndex++;
        if (modal.currentMessageIndex >= modal.messages.length) {
            if (typeof modal.onConfirm === 'function') {
                modal.onConfirm();
            }
        }
    },
    
    showDiceRollAnimation(title, playerRolls = [], opponentRolls = []) {
        return new Promise(resolve => {
            // 如果開啟加速，則完全跳過動畫，直接結束
            if (this.combat.fastCombat) {
                resolve();
                return;
            }

            this.modals.dice.sides.player = playerRolls.map(r => ({ ...r, isRolling: true }));
            this.modals.dice.sides.opponent = opponentRolls.map(r => ({ ...r, isRolling: true }));
            this.modals.dice.title = title;
            this.modals.dice.isOpen = true;
            this.modals.dice.onComplete = resolve;

            setTimeout(() => {
                this.modals.dice.sides.player.forEach(r => r.isRolling = false);
                this.modals.dice.sides.opponent.forEach(r => r.isRolling = false);
                setTimeout(() => {
                    this.closeDiceModal();
                }, 1000);
            }, 500);
        });
    },

    closeDiceModal() {
        if (typeof this.modals.dice.onComplete === 'function') {
            this.modals.dice.onComplete();
        }
        this.modals.dice.isOpen = false;
        this.modals.dice.onComplete = null;
    },

    async combatDelay(duration) {
        // 只有在「戰鬥加速」關閉時，才執行延遲
        if (!this.combat.fastCombat) {
            await new Promise(res => setTimeout(res, duration));
        }
    },
};