// js/modules/ui.js

const uiModule = {
    handleConstructionClick() {
        this.modals.construction.isOpen = true;
        if (this.tutorial.active && this.tutorial.step === 2) {
            setTimeout(() => {
                this.advanceTutorial(3);
            }, 100);
        }
    },

    handleRaidButtonClick() {
        const canRaid = this.buildings.dungeon.level > 0;
        if (canRaid) {
            this.screen = 'raid_selection';
            if (this.tutorial.active && this.tutorial.step === 5) {
                this.advanceTutorial(5.5);
            }
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
            this.merchant.dialogue = "「哎呀...這麼想我嗎？會有下次的」";
        } else {
            this.merchant.dialogue = "「嘿嘿嘿...哥布林王...今天有什麼「好貨」？買點好東西嗎？」";
        }
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
            this.merchant.dialogue = "「真是大手筆，歡迎下次再來」";
        } else {
            this.merchant.dialogue = "「眼光不錯，這裝備肯定能成為助力」";
            clearTimeout(this.merchantDialogueTimeout);
            this.merchantDialogueTimeout = setTimeout(() => {
                this.updateMerchantDialogue();
            }, 4000);
        }

        this.merchant.purchases++;
        if (this.merchant.purchases === 47) {
            const shijiClone = new FemaleHuman( '世紀的分身', { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: 147 }, '魅魔', { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' } );
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
                    const princessStats = { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: randomInt(150, 200) };
                    const princess = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], princessStats, '公主', generateVisuals());
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
                    const shijiClone = new FemaleHuman('世紀的分身', { strength: 20, agility: 20, intelligence: 20, luck: 20, charisma: 147 }, '魅魔', { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' });
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
        this.modals.construction.isOpen = true;
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';
        this.showCustomAlert(message);
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
    
    startTutorial(choice) {
    this.tutorial.active = choice;
    this.screen = 'tribe'; // 只切換畫面，初始化交給 x-init
    },
    advanceTutorial(step) {
        this.tutorial.step = step;
        switch(step) {
            //  步驟1: 僅作為一次性的裝備提示，確認後直接推進到步驟2
            case 1:
                this.showCustomAlert(
                    '你在部落中發現了一些基礎裝備！你可以隨時在「部落建設」->「倉庫」->「玩家背包」中找到並穿上它們。',
                    () => { this.advanceTutorial(2); } // 點擊確認後，立即執行下一步教學
                );
                break;
            //  步驟2: 引導點擊「部落建設」
            case 2:
                this.showCustomAlert('一個強大的部落需要穩固的根基。讓我們點擊發光的『部落建設』按鈕，來規劃您的部落。');
                break;
            //  步驟3: 引導建造「地牢」
            case 3:
                this.modals.construction.isOpen = true;
                this.modals.construction.activeTab = 'dungeon';
                this.modals.dungeon.subTab = 'upgrade';
                this.showCustomAlert('做得好！現在請點擊發光的『升級』分頁，並為您的部落打下第一個根基。');
                break;
            //  步驟4: 引導建造「產房」
            case 4:
                this.modals.construction.activeTab = 'maternity';
                this.modals.maternity.subTab = 'upgrade';
                break;
            //  步驟5: 引導「出擊掠奪」
            case 5:
                this.modals.construction.isOpen = false;
                setTimeout(() => {
                    this.showCustomAlert('太棒了！所有基礎設施都已就緒。關閉此視窗，點擊發光的『出擊掠奪』為部落帶來第一批女性吧！');
                }, 100);
                break;
            // ... 後續步驟 5.5, 6, 7 維持不變 ...
            case 5.5: 
                this.showCustomAlert('王，知己知彼，百戰不殆。在未知的土地上，首先使用『偵查環境』來探查周遭的危險與機遇吧。');
                break;
            case 6:
                this.showCustomAlert('恭喜王！您帶回了部落的第一批戰利品。現在，再次進入「部落建設」，找到「地牢」中的「繁衍後代」功能。您可以根據剩餘次數，選擇一位或多位對象，為您的部落產下更強大的哥布林戰士吧！');
                break;
            case 7:
                const modal = this.modals.narrative;
                modal.isOpen = true;
                modal.title = "與神秘商人的相遇";
                modal.type = "tutorial"; 
                modal.isLoading = false;
                modal.isAwaitingConfirmation = false;
                modal.content = `
                    <p>呵呵...哥布林王...我有很多好東西...。</p>
                    <p>叫我『世紀』就好，一個四處遊蕩，尋找『有趣』事物的旅行商人，絕對不是什麼可疑的人，嘿...。</p>
                    <br>
                    <p>把那些抓來的妹子...嘿嘿...給ㄨㄛ...咳!我是說交易，會給你一些收藏的寶貝作為回報。</p>
                    <br>
                    <p><b>左邊是我的商品，右邊是你的『貨幣』(你懂的...)。選好商品，再湊齊足夠素質的俘虜，就能完成交易了。</b></p>
                    <br>
                    <p>很簡單吧？我很期待...嘿嘿嘿...(口水)</p>
                `;
                break;
        }
    },
    triggerTutorial(eventName) {
        if (!this.tutorial.active) return;

        //    如果玩家不在部落，則將教學事件暫存起來
        if (this.screen !== 'tribe') {
            this.tutorial.pendingTutorial = eventName;
            return; // 暫不執行，等待玩家返回部落
        }

        // 如果玩家在部落，則正常執行教學
        switch (eventName) {
            case 'firstAttributePoint':
                if (!this.tutorial.finishedAttributePoints) {
                    this.showCustomAlert('王，您因繁衍而變得更強，獲得了「能力點」！請在您的狀態欄中，點擊能力值旁邊發光的「+」按鈕來分配它，提升您的實力。');
                    this.tutorial.finishedAttributePoints = true;
                }
                break;
            case 'firstBirth':
                if (!this.tutorial.finishedPartyMgmt) {
                    this.showCustomAlert('恭喜！您的第一個孩子誕生了。請前往「部落建設」->「寢室」->「管理夥伴」，將他加入您的出擊隊伍，他將為您提供戰力加成！');
                    this.tutorial.finishedPartyMgmt = true;
                }
                break;
            case 'firstLoot':
                if (!this.tutorial.finishedEquipping) {
                    this.showCustomAlert('您獲得了第一件裝備！它被存放在「部落建設」->「倉庫」->「玩家背包」中。您可以將它裝備在自己或夥伴身上以增強戰力。');
                    this.tutorial.finishedEquipping = true;
                }
                break;
            case 'armoryBuilt':
                if (!this.tutorial.finishedDecomposing) {
                    this.showCustomAlert('兵工廠已建成！現在您可以將多餘或老舊的裝備「分解」成資源了。這在「倉庫」管理介面中進行操作。');
                    this.tutorial.finishedDecomposing = true;
                }
                break;
        }
        // 觸發後清除暫存
        this.tutorial.pendingTutorial = null;
    },
};