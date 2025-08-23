const gameLogic = {
    pendingDecisions: [],
    //派遣系統
    dispatch: {
        hunting: [], // 打獵隊伍
        logging: [], // 伐木隊伍
        mining: [],  // 採礦隊伍
    },
    bailoutCounter: 0, // 【新增此行】用來計算玩家求助的次數
    raidTimeExpired: false, // 【新增此行】用來標記時間是否在戰鬥中耗盡
    isRetreatingWhenTimeExpired: false, // 【新增此行】記錄時間耗盡時是否正在脫離
    bailoutOfferedButRefused: false, // 【新增此行】記錄玩家是否拒絕過求助
    screen: 'api_key_input', // 【修改】將初始畫面改為 API 輸入介面
    userApiKey: '',          // 【新增】用來儲存玩家輸入的金鑰
    musicSettings: {
        src: null,
        isPlaying: false,
        playOnScreen: 'tribe', // 預設在部落畫面播放
    },
    //用於重生畫面的資料物件
    rebirth: {
        name: '',
        height: 0,
        penisSize: 0,
        appearance: '',
        stats: { strength: 1, agility: 1, intelligence: 1, luck: 1 },
        totalPoints: 0, // 總點數將在觸發重生時計算
        get pointsRemaining() { 
            return this.totalPoints - Object.values(this.stats).reduce((a, b) => a + b, 0); 
        }
    },
    //觸發重生的函式
    initiateRebirth() {
        this.logMessage('tribe', `${this.player.name} 在戰鬥中倒下了... 但哥布林的生命力讓你從死亡邊緣歸來！`, 'system');
        
        // 1. 計算總能力點數
        const total = Object.values(this.player.stats).reduce((a, b) => a + b, 0);
        this.rebirth.totalPoints = total;

        // 2. 載入當前外觀設定
        this.rebirth.name = this.player.name;
        this.rebirth.height = this.player.height;
        this.rebirth.penisSize = this.player.penisSize;
        this.rebirth.appearance = this.player.appearance;

        // 3. 預設將點數設為最低值 1，其餘為待分配
        this.rebirth.stats = { strength: 1, agility: 1, intelligence: 1, luck: 1 };
        
        // 4. 切換至重生畫面
        this.screen = 'rebirth';
        this.showCustomAlert('你獲得了重塑自身的機會！');
    },

    //處理重生畫面點數分配的函式
    updateRebirthStat(stat, value) {
        const intValue = parseInt(value);
        if (!isNaN(intValue) && intValue >= 1) { // 確保點數至少為 1
            this.rebirth.stats[stat] = intValue;
        } else {
            this.rebirth.stats[stat] = 1; // 如果輸入無效，則重設為 1
        }
    },

    //確認重生設定的函式
    confirmRebirth() {
        if (this.rebirth.pointsRemaining !== 0) {
            this.showCustomAlert(`你還有 ${this.rebirth.pointsRemaining} 點能力點尚未分配！`);
            return;
        }

        // 更新玩家資料
        this.player.height = this.rebirth.height;
        this.player.penisSize = this.rebirth.penisSize;
        this.player.appearance = this.rebirth.appearance;
        this.player.stats = this.rebirth.stats;

        // 恢復狀態並返回部落
        this.player.updateHp(this.isStarving);
        this.player.currentHp = this.player.maxHp;
        this.screen = 'tribe';
        this.logMessage('tribe', '你重塑了肉體與靈魂，以全新的姿態重生！', 'success');
    },

    executeQuickBreeding() {
        // --- 包含了所有繁衍的後台遊戲機制 ---
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        selectedIds.forEach(id => {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
            }
        });

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性快速進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        
        // 重置並關閉視窗
        this.modals.dungeon.selectedBreedIds = [];
        this.modals.construction.isOpen = false;
        
        // 繁衍會消耗一天
        this.nextDay();
    },

    returnToBreedingModal(message) {
        this.screen = 'tribe';
        this.modals.construction.isOpen = true;
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';
        this.showCustomAlert(message);
    },

    handleBreedingClick() {
        // --- 這是按鈕點擊後的總控制器 ---

        // 1. 先執行所有前置檢查
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;
        if (selectedCount === 0) {
            this.showCustomAlert('請至少選擇一名繁衍對象。');
            return;
        }
        if (selectedCount > this.breedingChargesLeft) {
            this.showCustomAlert(`繁衍次數不足！你只能選擇最多 ${this.breedingChargesLeft} 位。`);
            return;
        }
        if (this.mothers.length + selectedCount > this.maternityCapacity) {
            this.showCustomAlert(`產房空間不足！剩餘空間：${this.maternityCapacity - this.mothers.length}`);
            return;
        }

        // 2. 智慧判斷：根據有無 API Key 決定流程
        if (this.userApiKey && this.userApiKey.trim() !== '') {
            // 如果有 Key，執行AI敘事流程
            this.startBreedingNarrative();
        } else {
            // 如果沒有 Key，執行快速繁衍
            this.executeQuickBreeding();
        }
    },

    loadMusic(event) {
        const file = event.target.files[0];
        if (file) {
            // 釋放舊的 URL 避免內存洩漏
            if (this.musicSettings.src) {
                URL.revokeObjectURL(this.musicSettings.src);
            }
            // 建立新的檔案 URL
            this.musicSettings.src = URL.createObjectURL(file);
            this.$refs.audioPlayer.src = this.musicSettings.src;
            // 載入後，我們假設使用者想要播放，所以設定 isPlaying 為 true
            this.musicSettings.isPlaying = true;
            // 嘗試播放，並處理可能因瀏覽器限制而導致的自動播放失敗
            this.$refs.audioPlayer.play().catch(e => {
                console.warn("自動播放失敗，需要使用者手動互動。");
                // 如果播放失敗，將狀態同步為 false
                this.musicSettings.isPlaying = false;
            });
        }
    },

    toggleMusic() {
        // 如果沒有音樂檔案，則不執行任何操作
        if (!this.musicSettings.src) return;

        // 根據 audio 元素的實際暫停狀態來切換
        if (this.$refs.audioPlayer.paused) {
            this.$refs.audioPlayer.currentTime = 0; // 【新增此行】將音樂拉回開頭
            this.$refs.audioPlayer.play();
            this.musicSettings.isPlaying = true;
        } else {
            this.$refs.audioPlayer.pause();
            this.musicSettings.isPlaying = false;
        }
    },
    musicSettings: {
        src: null,
        isPlaying: false,
        playOnScreen: 'tribe', // 預設在部落畫面播放
    },
    day: 1,
    player: null,
    partners: [],
    captives: [],
    resources: { food: 200, wood: 200, stone: 200 },
    warehouseInventory: [], 
    buildings: {
        dungeon: { level: 0, name: "地牢" },
        warehouse: { level: 0, name: "倉庫" },
        barracks: { level: 0, name: "寢室" },
        armory: { level: 0, name: "兵工廠" },
        maternity: { level: 0, name: "產房" },
        trainingGround: { level: 0, name: "訓練場" }, 
        merchantCamp: { level: 0, name: "商人營地" },
    },
    modals: {
        dispatch: { isOpen: false, activeTab: 'hunting' }, // 【新增】派遣系統 modal
        construction: { isOpen: false, activeTab: 'dungeon' },
        dungeon: { subTab: 'manage', selectedBreedIds: [] },
        barracks: { subTab: 'manage', selectedPartyIds: [] },
        partnerEquipment: { isOpen: false, partnerId: null, activeFilter: 'all' },
        warehouse: { subTab: 'manage', activeFilter: 'all' },
        armory: { subTab: 'craft', craftingType: '劍', craftingMaterial: 'iron' },
        maternity: { subTab: 'manage' },
        merchant: { isOpen: false },
        scoutInfo: { isOpen: false, target: null, emptyBuildingMessage: '' },
        captiveManagement: { isOpen: false, title: '', list: [], limit: 0, selectedIds: [], type: '', context: null },
        narrative: { isOpen: false, title: '', content: '', isLoading: false, hasBred: false, context: [], currentCaptives: [], type: '', isAwaitingConfirmation: false },
        customAlert: { isOpen: false, message: '', onConfirm: null },
        discardConfirm: { isOpen: false, itemId: null, itemName: '' },
        raidStatus: { isOpen: false, activeTab: 'status' },
        throneScout: { isOpen: false, unit: null },
        itemManagement: { isOpen: false, title: '', message: '', items: [], capacity: 0, onConfirm: null },
        raidCaptives: { isOpen: false },
        partnerManagement: { isOpen: false, list: [], limit: 0, selectedIds: [], newbornId: null, context: null },
        bailoutConfirm: {
            isOpen: false,
            messages: [], // 要問的問題列表
            currentMessageIndex: 0, // 當前問題的索引
            onConfirm: null // 確認到底後要執行的動作
        },
    },
    
    merchant: { 
        dialogue: '', // 【新增此行】用來存放當前對話
        throneRoomUnits: [],
        isPresent: false,
        goods: [],
        stayDuration: 0,
        purchases: 0, // 用於追蹤彩蛋
        selectedItemIds: [], // 【修改】改為陣列以支援複選
        selectedCaptiveIds: [],
    },

    isStarving: false,
    narrativeMemory: '',
    tutorial: {
        active: false, // 總開關，判斷玩家是否需要教學
        pendingTutorial: null, // 【新增】用於存放待處理的教學事件
        // --- 以下為各教學模組的完成狀態旗標 ---
        finishedIntro: false,         // 完成初級教學 (建築->掠奪->繁衍)
        finishedPartyMgmt: false,     // 完成夥伴管理教學
        finishedEquipping: false,     // 完成裝備教學
        finishedDecomposing: false,   // 完成分解教學
        finishedAttributePoints: false, // 完成屬性點教學
        // 保留商人旗標
        merchantMet: false
    },
    triggerTutorial(eventName) {
        if (!this.tutorial.active) return;

        // 【核心修改】如果玩家不在部落，則將教學事件暫存起來
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
    hasSaveFile: false,
    isGeneratingAvatar: false,
    tempStatIncreases: { strength: 0, agility: 0, intelligence: 0, luck: 0 },
    isNewGame: true, 
    postBattleBirths: [], 
    logs: {
        tribe: [],
        raid: [],
        combat: []
    },
    playerMapPosition: { x: -100, y: -100 }, // 玩家在地圖上的位置，預設在畫面外
    selectedTarget: null, // 當前選中的目標 (建築或敵人)
    isCombatLocked: false, // 是否被巡邏隊鎖定，無法移動
    mapScale: 1, // 【新增此行】用於地圖縮放

    knightPositions: [ // <--- 請將這個陣列新增於此
        { top: '40%', left: '50%' }, // V字頂點
        { top: '50%', left: '40%' }, // 第二排左
        { top: '50%', left: '60%' }, // 第二排右
        { top: '60%', left: '30%' }, // 第三排左
        { top: '60%', left: '70%' }, // 第三排右
        { top: '70%', left: '20%' }, // 第四排左
        { top: '70%', left: '80%' }, // 第四排右
    ],
    
    get warehouseCapacity() { 
        return CAPACITY_LEVELS.warehouse[this.buildings.warehouse.level] || 0;
    },
    get backpackCapacity() {
        // 背包容量永遠跟倉庫容量同步
        return this.warehouseCapacity;
    },
    get captiveCapacity() { 
        return CAPACITY_LEVELS.dungeon[this.buildings.dungeon.level] || 0;
    },
    get maternityCapacity() {
        // 產房和地牢使用相同的升級級距
        return CAPACITY_LEVELS.dungeon[this.buildings.maternity.level] || 0;
    },
    get partnerCapacity() { 
        return CAPACITY_LEVELS.barracks[this.buildings.barracks.level] || 0;
    },
    get foodCapacity() { 
        return CAPACITY_LEVELS.storage[this.buildings.warehouse.level] || 0;
    },
    get woodCapacity() { 
        // 木材容量永遠跟食物容量同步
        return this.foodCapacity; 
    },
    get stoneCapacity() { 
        // 礦石容量永遠跟食物容量同步
        return this.foodCapacity; 
    },

    get dailyFoodConsumption() {
        if (!this.player) return 0;
        const allMembers = [this.player, ...this.partners, ...this.captives];
        return allMembers.reduce((total, member) => {
            let statSum = member.stats.strength + member.stats.agility + member.stats.intelligence + member.stats.luck;
            if (member.stats.charisma) {
                statSum += member.stats.charisma;
            }
            return total + Math.floor(statSum / 10);
        }, 0);
    },
    get totalBreedingCharges() {
        if (!this.player) return 1;
        // 【修改】將 getTotalStat('luck') 改為 stats.luck，只計算玩家本體原始點數
        return 1 + Math.floor(this.player.stats.luck * 0.1);
    },
    get carryCapacity() {
        if (!this.player) return 0;
        return (this.player.party.length + 1) * 2;
    },
    get dungeonCaptives() {
        return this.captives.filter(c => !c.isPregnant && !c.isMother);
    },
    get mothers() {
        return this.captives.filter(c => c.isPregnant || c.isMother);
    },
    get potentialTrainingPoints() {
        if (!this.player) return 0;
        const rawStatSum = this.player.stats.strength + this.player.stats.agility + this.player.stats.intelligence + this.player.stats.luck;
        return Math.floor(rawStatSum / 4);
    },
    get currentlyEditingPartner() {
        if (!this.modals.partnerEquipment.partnerId) return null;
        
        // 【新增】判斷目標是否為玩家本人
        if (this.modals.partnerEquipment.partnerId === 'player') {
            return this.player;
        }
        
        // 維持原有邏輯，尋找夥伴
        return this.partners.find(p => p.id === this.modals.partnerEquipment.partnerId);
    },
    get filteredWarehouseInventory() {
        const filter = this.modals.warehouse.activeFilter;
        if (filter === 'all') return this.warehouseInventory;
        return this.warehouseInventory.filter(item => {
            if (filter === 'weapon') return item.slot === 'mainHand';
            if (filter === 'shield') return item.baseName === '盾';
            if (filter === 'armor') return item.slot === 'chest';
            return true;
        });
    },
    get filteredPlayerInventory() {
        if (!this.player) {
            return [];
        }
        const filter = this.modals.warehouse.activeFilter;
        if (filter === 'all') return this.player.inventory;
        return this.player.inventory.filter(item => {
            if (filter === 'weapon') return item.slot === 'mainHand';
            if (filter === 'shield') return item.baseName === '盾';
            if (filter === 'armor') return item.slot === 'chest';
            return true;
        });
    },
    get filteredPartnerWarehouse() {
        const filter = this.modals.partnerEquipment.activeFilter;
        if (filter === 'all') return this.warehouseInventory;
        return this.warehouseInventory.filter(item => {
            if (filter === 'weapon') return item.slot === 'mainHand';
            if (filter === 'shield') return item.baseName === '盾';
            if (filter === 'armor') return item.slot === 'chest';
            return true;
        });
    },
    get filteredPartnerBackpack() {
        if (!this.player) return [];
        const filter = this.modals.partnerEquipment.activeFilter;
        if (filter === 'all') return this.player.inventory;
        return this.player.inventory.filter(item => {
            if (filter === 'weapon') return item.slot === 'mainHand';
            if (filter === 'shield') return item.baseName === '盾';
            if (filter === 'armor') return item.slot === 'chest';
            return true;
        });
    },
    openPartnerEquipment(partnerId) {
        this.modals.partnerEquipment.partnerId = partnerId;
        this.modals.partnerEquipment.isOpen = true;
    },
    openPlayerEquipment() {
        this.modals.partnerEquipment.partnerId = 'player'; // 將目標設為 'player'
        this.modals.partnerEquipment.isOpen = true;
    },
    getUnitColor(unitOrGroup) {
        const unit = Array.isArray(unitOrGroup) ? unitOrGroup[0] : unitOrGroup;
        if (!unit) return 'bg-gray-500'; // 安全備用
        if (unit.id === this.player.id) return 'bg-green-500';
        if (unit.profession === '公主') return 'bg-yellow-400';
        if (Object.keys(KNIGHT_ORDER_UNITS).includes(unit.profession)) return 'bg-orange-500';
        if (unit.profession === '城市守軍') return 'bg-red-500';
        return 'bg-white'; // 居民
    },
    handleMapClick(target, event) {
        if (this.isCombatLocked) {
            this.showCustomAlert('你被巡邏隊攔截了，必須先擊敗他們！');
            return;
        }
        event.stopPropagation();

        this.selectedTarget = target;

        this.$nextTick(() => {
            if (!this.selectedTarget) return; // 如果目標已清除，則不移動
            
            let anchorX, anchorY;
            if (Array.isArray(this.selectedTarget)) {
                anchorX = this.selectedTarget[0].x - 10; // 微調位置
                anchorY = this.selectedTarget[0].y + 10; // 微調位置
            } else {
                anchorX = this.selectedTarget.x + (this.selectedTarget.width / 2) - 10;
                anchorY = this.selectedTarget.y + this.selectedTarget.height;
            }
            this.playerMapPosition.x = anchorX;
            this.playerMapPosition.y = anchorY;
        });
    },

    getInteractionMenuPosition() {
        if (!this.selectedTarget) return 'left: -999px; top: -999px;'; // 如果沒有目標，則移出畫面外

        const menuWidth = 100;
        const menuHeight = 80;
        const offsetX = 10;
        const offsetY = 10;

        let anchorX, anchorY;
        if (Array.isArray(this.selectedTarget)) {
            anchorX = this.selectedTarget[0].x;
            anchorY = this.selectedTarget[0].y;
        } else {
            anchorX = this.selectedTarget.x + (this.selectedTarget.width / 2);
            anchorY = this.selectedTarget.y + this.selectedTarget.height;
        }

        let targetX = anchorX + offsetX;
        let targetY = anchorY - offsetY - menuHeight;

        if (targetX + menuWidth > MAP_WIDTH) {
            targetX = anchorX - offsetX - menuWidth;
        }
        if (targetY < 0) {
            targetY = anchorY + offsetY;
        }

        return `left:${targetX}px; top:${targetY}px;`;
    },

    executeBuildingScout(building) {
        if (building.isFinalChallenge) {
            if (building.scouted) {
                this.showCustomAlert('城堡深處的氣息令人不寒而慄，你已準備好深入王座之間。');
                return;
            }
            this.logMessage('raid', '你開始偵查宏偉的城堡...', 'player');
            this.currentRaid.timeRemaining -= 3;
            building.scouted = true;
            this.logMessage('raid', '偵查成功！一股強大且混雜的氣息從城堡深處傳來...你現在可以「深入內城」前往「王座之間」了。', 'success');
            this.checkRaidTime();
            return;
        }
        if (building.scouted) {
            if (building.occupants.length > 0) {
                this.modals.scoutInfo.target = building.occupants;
            } else {
                this.modals.scoutInfo.target = [];
                this.modals.scoutInfo.emptyBuildingMessage = building.looted 
                    ? '這棟建築是空的，你已搜刮過。' 
                    : '這棟建築是空的，看來可以搜刮一番。';
            }
            this.modals.scoutInfo.isOpen = true;
            return;
        }

        this.logMessage('raid', `你開始偵查 ${building.type}...`, 'player');
        const playerIntel = this.player.getTotalStat('intelligence', this.isStarving);
        const successChance = 80 + playerIntel * 0.5;

        if (roll(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            building.scouted = true;
            this.logMessage('raid', `偵查成功！`, 'success');

            if (building.occupants.length > 0) {
                building.postScoutText = ` (${building.occupants.length}人)`;
                this.modals.scoutInfo.target = building.occupants;
            } else {
                building.postScoutText = building.looted ? ' (空)' : ' (可搜刮)';
                this.modals.scoutInfo.target = [];
                this.modals.scoutInfo.emptyBuildingMessage = building.looted 
                    ? '這棟建築是空的，你已搜刮過。' 
                    : '這棟建築是空的，看來可以搜刮一番。';
            }
            this.modals.scoutInfo.isOpen = true;
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `偵查 ${building.type} 失敗，你一無所獲。`, 'enemy');
        }
        this.checkRaidTime();
    },
    
    closeScoutModalAndClearTarget() {
        this.modals.scoutInfo.isOpen = false;
        this.selectedTarget = null;
    },

    startCombatFromScout(enemyGroup) {
        if (enemyGroup && enemyGroup.length > 0) {
            this.startCombat(enemyGroup);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    startCombatFromModal() {
        if (this.selectedTarget && !Array.isArray(this.selectedTarget) && this.selectedTarget.occupants) {
            this.startCombat(this.selectedTarget.occupants);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    lootBuildingFromModal() {
        if (this.selectedTarget && !Array.isArray(this.selectedTarget)) {
            this.lootBuilding(this.selectedTarget);
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
        }
    },

    executeTraining(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner || partner.hasBeenTrained) {
            this.showCustomAlert("此夥伴無法被訓練。");
            return;
        }

        const pointsGained = this.potentialTrainingPoints;
        if (pointsGained <= 0) {
            this.showCustomAlert("以王您現在的狀態，無法為夥伴帶來任何提升。");
            return;
        }

        const statKeys = ['strength', 'agility', 'intelligence', 'luck'];
        let pointDistributionLog = { strength: 0, agility: 0, intelligence: 0, luck: 0 };

        for (let i = 0; i < pointsGained; i++) {
            const randomStat = statKeys[randomInt(0, 3)];
            partner.stats[randomStat]++;
            pointDistributionLog[randomStat]++;
        }

        partner.hasBeenTrained = true;

        // 【新增】在屬性增加後，立刻更新夥伴的生命值
        partner.updateHp(this.isStarving);

        this.logMessage('tribe', `你花費了一整天時間，對 ${partner.name} 進行了嚴格的訓練！`, 'player');
        const logDetails = Object.entries(pointDistributionLog)
            .filter(([stat, value]) => value > 0)
            .map(([stat, value]) => `${STAT_NAMES[stat]} +${value}`)
            .join(', ');
        this.logMessage('tribe', `${partner.name} 的潛力被激發了：${logDetails}。`, 'success');
        
        // 【新增】顯示一個包含詳細結果的提示框
        this.showCustomAlert(`${partner.name} 的訓練完成了！\n獲得的能力提升：\n${logDetails}`);

        this.nextDay(); // 訓練消耗一天
    },

    calculateEquipmentValue(item) {
        if (!item) return 0;
        const damage = item.stats.damage || 0;
        const hp = item.stats.hp || 0;
        // 根據GDD: 裝備價值 = (裝備總傷害 × 6) + 裝備總生命值
        return (damage * 6) + hp;
    },
    calculateCaptiveValue(captive) {
        if (!captive) return 0;
        const hp = captive.calculateMaxHp();
        // 根據GDD: 俘虜價值 = 該俘虜當前總生命值 × 1.5
        return Math.floor(hp * 1.5);
    },
    // 【修改】重新命名並修改邏輯以處理陣列
    get selectedItems() {
        if (!this.merchant.selectedItemIds || this.merchant.selectedItemIds.length === 0) return [];
        const selectedSet = new Set(this.merchant.selectedItemIds);
        return this.merchant.goods.filter(g => selectedSet.has(g.id));
    },
    // 【修改】重新命名並修改邏輯以計算總和
    get selectedItemsValue() {
        return this.selectedItems.reduce((total, item) => total + this.calculateEquipmentValue(item), 0);
    },
    get selectedCaptivesValue() {
        return this.merchant.selectedCaptiveIds.reduce((total, id) => {
            const captive = this.dungeonCaptives.find(c => c.id === id);
            return total + (captive ? this.calculateCaptiveValue(captive) : 0);
        }, 0);
    },
    get canExecuteTrade() {
        // 【修改】更新判斷條件以適應複選
        return this.merchant.selectedItemIds.length > 0 && this.merchant.selectedCaptiveIds.length > 0 && this.selectedCaptivesValue >= this.selectedItemsValue;
    },
    // 【新增】根據商店狀態更新商人對話的函式
    updateMerchantDialogue() {
        if (this.merchant.goods.length === 0) {
            this.merchant.dialogue = "「哎呀...這麼想我嗎？會有下次的」";
        } else {
            this.merchant.dialogue = "「嘿嘿嘿...哥布林王...今天有什麼「好貨」？買點好東西嗎？」";
        }
    },

    // 【新增】打開商人介面的準備函式
    openMerchant() {
        this.updateMerchantDialogue(); // 先設定好初始對話
        this.modals.merchant.isOpen = true; // 再打開介面
    },
    executeTrade() {
        if (!this.canExecuteTrade) {
            this.showCustomAlert("交易條件不滿足！");
            return;
        }

        const tradedItems = this.selectedItems;
        const tradedItemIds = new Set(this.merchant.selectedItemIds);
        const tradedCaptiveIds = new Set(this.merchant.selectedCaptiveIds);

        // 【修正】使用深拷貝複製物品，而不是直接轉移物件參照
        const newItemsForPlayer = JSON.parse(JSON.stringify(tradedItems));
        this.player.inventory.push(...newItemsForPlayer);
        this.logMessage('tribe', `你用俘虜換來了 ${tradedItems.length} 件裝備！`, 'success');

        const tradedCaptives = this.captives.filter(c => tradedCaptiveIds.has(c.id));
        this.captives = this.captives.filter(c => !tradedCaptiveIds.has(c.id));
        this.logMessage('tribe', `你失去了 ${tradedCaptives.map(c => c.name).join(', ')} 這 ${tradedCaptives.length} 名俘虜。`, 'info');

        this.merchant.goods = this.merchant.goods.filter(g => !tradedItemIds.has(g.id));
        this.merchant.selectedItemIds = [];
        this.merchant.selectedCaptiveIds = [];

        // 【核心修改】根據交易後的狀態更新對話
        if (this.merchant.goods.length === 0) {
            // 如果商品被買完了
            this.merchant.dialogue = "「真是大手筆，歡迎下次再來」";
        } else {
            // 如果還有商品
            this.merchant.dialogue = "「眼光不錯，這裝備肯定能成為助力」";
            // 讓這句「反應式對話」停留 4 秒後，再恢復成預設對話
            setTimeout(() => {
                this.updateMerchantDialogue();
            }, 4000);
        }

        // 5. 處理彩蛋計數
        this.merchant.purchases++;
        if (this.merchant.purchases === 47) {
            const shijiClone = new FemaleHuman(
                '世紀的分身', 
                { strength: 47, agility: 47, intelligence: 47, luck: 47, charisma: 201 },
                '魅魔',
                { hairColor: '深棕色', hairStyle: '波波頭', height: 168, age: '未知', bust: 'E', personality: '悶騷', clothing: '魅魔裝' }
            );
            this.captives.push(shijiClone);
            this.showCustomAlert("「呵...你很懂『交易』嘛...。這個福利就送給你，哥布林王...」你發現一名特殊的魅魔出現在了你的地牢中！");
            this.logMessage('tribe', `你達成了與「世紀」的第47次交易，獲得了特殊俘虜 [世紀的分身]！`, 'system');
        }
    },

    breedingChargesLeft: 0,
    
    currentRaid: null,
    combat: { allies: [], enemies: [], turn: 0, log: [], isProcessing: false, currentEnemyGroup: [], playerActionTaken: false, isReinforcementBattle: false },
    
    submitApiKey() {
        if (this.userApiKey && this.userApiKey.trim() !== '') {
            localStorage.setItem('goblinKingApiKey', this.userApiKey);
            this.showCustomAlert('API 金鑰已儲存！');
        }
        this.proceedToGame();
    },
    loadApiKey() {
        const savedKey = localStorage.getItem('goblinKingApiKey');
        if (savedKey) {
            this.userApiKey = savedKey;
        }
    },
    proceedToGame() {
        // 確保畫面永遠先進入序幕
        this.screen = 'intro';
    },

    init() {
        this.loadApiKey();
        this.logMessage('tribe', "哥布林王國v5.02 初始化...");
        this.checkForSaveFile();
        this.$watch('screen', (newScreen) => {
            // 當玩家回到部落畫面，且有待辦事項時
            if (newScreen === 'tribe' && this.pendingDecisions.length > 0) {
                // 使用 setTimeout 確保畫面已完全切換，避免彈窗閃爍
                setTimeout(() => this.processNextDecision(), 100);
            }
        });
        this.$watch('modals.construction.isOpen', (isOpen) => {
            // 當建築介面被關閉 (isOpen 變為 false)
            // 且玩家剛好處於「拒絕過幫助」的狀態
            if (!isOpen && this.bailoutOfferedButRefused) {
                // 重置旗標
                this.bailoutOfferedButRefused = false; 
                // 延遲一小段時間再觸發，避免視窗閃爍
                setTimeout(() => {
                    this.handleBailoutRequest();
                }, 200);
            }
        });
        this.$watch('modals.construction.isOpen', (isOpen) => {
            if (isOpen && this.player && this.modals.construction.activeTab === 'barracks') {
                this.modals.barracks.selectedPartyIds = this.player.party.map(p => p.id);
            }
        });
        this.$watch('modals.construction.activeTab', (newTab) => {
            if (newTab === 'barracks' && this.player) {
                this.modals.barracks.selectedPartyIds = this.player.party.map(p => p.id);
            }
        });

        // 【智慧播放監聽器】
        this.$watch('screen', (newScreen) => {
            // 當前畫面符合設定時，且音樂是播放狀態，就播放
            if (newScreen === this.musicSettings.playOnScreen && this.musicSettings.isPlaying) {
                if (this.$refs.audioPlayer.paused) {
                    this.$refs.audioPlayer.currentTime = 0; // 【新增此行】將音樂拉回開頭
                    this.$refs.audioPlayer.play().catch(e => {});
                }
            } else { // 否則就暫停
                if (!this.$refs.audioPlayer.paused) {
                    this.$refs.audioPlayer.pause();
                }
            }
        });
    },

    creation: {
        name: '哥布林王', height: 130, penisSize: 10,
        appearance: '有著一對尖耳朵、狡猾的眼神、戴著骨頭項鍊的綠皮膚哥布林',
        stats: { strength: 10, agility: 10, intelligence: 10, luck: 10 },
        statWarningMessage: '',
        lowStatWarnings: {},
        get pointsRemaining() { return 40 - Object.values(this.stats).reduce((a, b) => a + b, 0); }
    },
    
    updateStat(stat, value) {
        const intValue = parseInt(value);
        if (!isNaN(intValue)) {
            this.creation.stats[stat] = intValue;
            this.checkStatValue(stat, intValue);
        }
    },
    checkStatValue(stat, value) {
        const intValue = parseInt(value);

        if (isNaN(intValue)) {
            this.creation.stats[stat] = 0;
        } else {
            this.creation.stats[stat] = intValue;
        }

        const zeroStatCount = Object.values(this.creation.stats).filter(v => v <= 0).length;

        if (zeroStatCount >= 3) {
            this.creation.statWarningMessage = "只是路過的蒙面哥布林..."; // GDD 4.1
        } else if (zeroStatCount === 2) {
            this.creation.statWarningMessage = "Trans-Goblin..."; // GDD 4.1
        } else if (zeroStatCount === 1) {
            const zeroStatKey = Object.keys(this.creation.stats).find(key => this.creation.stats[key] <= 0);
            switch(zeroStatKey) {
                case 'strength': this.creation.statWarningMessage = "一武洋ㄎ...都能O死你，我不確定你還能站著..."; break;
                case 'agility': this.creation.statWarningMessage = "希望你跟霍ㄐ...一樣有輪椅（這邊好像不該出現這個詞..."; break;
                case 'intelligence': this.creation.statWarningMessage = "我不清楚哥布林能不能理解你，但我肯定不行..."; break;
                case 'luck': this.creation.statWarningMessage = "自古槍兵幸運E，你沒自殺是奇蹟..."; break;
            }
        } else {
            const hasLowStat = Object.values(this.creation.stats).some(v => v > 0 && v <= 4);
            if (hasLowStat) {
                this.creation.statWarningMessage = "我建議你不要，如果你仍執意...";
            } else {
                this.creation.statWarningMessage = '';
            }
        }
    },
    async createCharacter() {
        this.player = new Player(this.creation.name, this.creation.stats, this.creation.appearance, this.creation.height, this.creation.penisSize);
        const encodedName = encodeURIComponent(this.player.name);
        this.player.avatarUrl = `https://placehold.co/400x400/2d3748/cbd5e0?text=哥布林王\\n${encodedName}`;

        // 【核心修改】先切換畫面
        this.screen = 'birth_narrative';

        // 【核心修改】然後使用 $nextTick 確保新畫面渲染完成後，再設定其內部狀態
        this.$nextTick(() => {
            const modal = this.modals.narrative;
            modal.isAwaitingConfirmation = true;
            modal.isLoading = false;
            modal.content = '';
        });
    },
    
    initializeTribe() {
        if (!this.isNewGame) return;
        this.isNewGame = false;

        const starterSword = this.createEquipment('iron', 'worn', '劍');
        const starterArmor = this.createEquipment('iron', 'worn', '鎧甲');
        this.player.inventory.push(starterSword);
        this.player.inventory.push(starterArmor);
        
        this.logMessage('tribe', `你在空無一人的破舊部落中醒來，在一個腐朽的箱子裡發現了[${starterSword.name}]和[${starterArmor.name}]。`, 'system');

        const zeroStats = Object.keys(this.player.stats).filter(stat => ['strength', 'agility', 'intelligence', 'luck'].includes(stat) && this.player.stats[stat] === 0);
        const zeroStatCount = zeroStats.length;
        let itemToGenerate = null;

        if (zeroStatCount >= 3) {
            itemToGenerate = {
                slot: 'chest',
                baseName: '鎧甲',
                affix: 'henshin_curse',
                alert: '你感覺自己彷彿能變身成什麼，身上憑空出現了一件鎧甲...'
            };
        } else if (zeroStatCount === 2) {
            itemToGenerate = {
                slot: 'offHand',
                baseName: '盾',
                affix: 'gundam_curse',
                alert: '你感覺自己內心深處的某種東西覺醒了，手中憑空出現了一面盾...'
            };
        } else if (zeroStatCount === 1) {
            const stat = zeroStats[0];
            const itemMap = {
                strength: { baseName: '劍', affix: 'strength_curse', alert: '你感覺身體格外虛弱，但手中憑空出現了一把劍...' },
                agility: { baseName: '弓', affix: 'agility_curse', alert: '你感覺身體格外遲鈍，但手中憑空出現了一把弓...' },
                intelligence: { baseName: '法杖', affix: 'intelligence_curse', alert: '你感覺思緒一片混沌，但手中憑空出現了一把法杖...' },
                luck: { baseName: '長槍', affix: 'luck_curse', alert: '你感覺厄運纏身，但手中憑空出現了一把長槍...' },
            };
            if (itemMap[stat]) {
                itemToGenerate = { slot: 'mainHand', ...itemMap[stat] };
            }
        }

        const startTribeActions = () => {
            if (itemToGenerate) {
                const cursedItem = this.createEquipment('iron', 'worn', itemToGenerate.baseName, itemToGenerate.affix);
                this.player.equipment[itemToGenerate.slot] = cursedItem;
                this.logMessage('tribe', `你獲得了受詛咒的裝備：[${cursedItem.name}]！`, 'system');
                this.player.updateHp();
            }

            if (this.tutorial.active) {
                this.advanceTutorial(1);
            } else {
                this.logMessage('tribe', `第 ${this.day} 天：偉大的哥布林王 ${this.player.name} 的傳奇開始了！`, 'system');
            }
        };

        if (itemToGenerate) {
            this.showCustomAlert(itemToGenerate.alert, startTribeActions);
        } else {
            startTribeActions();
        }
        this.breedingChargesLeft = this.totalBreedingCharges;

        if (this.tutorial.pendingTutorial) {
            this.triggerTutorial(this.tutorial.pendingTutorial);
        }
    },
    startTutorial(choice) {
    this.tutorial.active = choice;
    this.screen = 'tribe'; // 只切換畫面，初始化交給 x-init
    },
    advanceTutorial(step) {
        this.tutorial.step = step;
        switch(step) {
            // 【修改】步驟1: 僅作為一次性的裝備提示，確認後直接推進到步驟2
            case 1:
                this.showCustomAlert(
                    '你在部落中發現了一些基礎裝備！你可以隨時在「部落建設」->「倉庫」->「玩家背包」中找到並穿上它們。',
                    () => { this.advanceTutorial(2); } // 點擊確認後，立即執行下一步教學
                );
                break;
            // 【修改】步驟2: 引導點擊「部落建設」
            case 2:
                this.showCustomAlert('一個強大的部落需要穩固的根基。讓我們點擊發光的『部落建設』按鈕，來規劃您的部落。');
                break;
            // 【修改】步驟3: 引導建造「地牢」
            case 3:
                this.modals.construction.isOpen = true;
                this.modals.construction.activeTab = 'dungeon';
                this.modals.dungeon.subTab = 'upgrade';
                this.showCustomAlert('做得好！現在請點擊發光的『升級』分頁，並為您的部落打下第一個根基。');
                break;
            // 【修改】步驟4: 引導建造「產房」
            case 4:
                this.modals.construction.activeTab = 'maternity';
                this.modals.maternity.subTab = 'upgrade';
                break;
            // 【修改】步驟5: 引導「出擊掠奪」
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
    executeBailout() {
        this.resources.food = 200;
        this.resources.wood = 200;
        this.resources.stone = 200;
        this.modals.bailoutConfirm.isOpen = false;
        // 使用 setTimeout 確保提示框在對話框關閉後再弹出
        setTimeout(() => {
            this.showCustomAlert('世紀「真是拿你沒辦法…資源已經恢復了。快去「部落建設」裡，優先建造「地牢」和「產房」吧！」');
        }, 100);
    },
    // 處理拒絕求助的函式
    refuseBailout() {
        this.bailoutOfferedButRefused = true;
        this.modals.bailoutConfirm.isOpen = false;
    },
    // 處理求助對話框的確認步驟
    confirmBailoutStep() {
        const modal = this.modals.bailoutConfirm;
        modal.currentMessageIndex++;
        // 如果還有下一個問題，就繼續問
        if (modal.currentMessageIndex < modal.messages.length) {
            // 這部分會讓 modal 的內容更新為下一個問題
        } else {
            // 所有問題都回答「是」了，執行最終的確認動作
            if (typeof modal.onConfirm === 'function') {
                modal.onConfirm();
            }
        }
    },

    // 【新增】啟動求助流程的主函式
    handleBailoutRequest() {
        this.bailoutCounter++; // 求助次數+1
        const modal = this.modals.bailoutConfirm;
        
        let questions = ["世紀「你是否承認自己跳過新手教學很呆?」"];
        const extraQuestions = ["世紀「真的嗎?」", "世紀「你確定?」", "世紀「沒有一點遲疑?」", "世紀「好吧，既然你都說到這個份上了...」", "世紀「最後一次機會囉?」", "世紀「我是誰?先回答你是不是呆瓜比較重要」", "世紀「我是誰?你之後就知道了。所以你是呆瓜嗎?」", "世紀「嘿...你不是第一次對吧?」", "世紀「嘿...騙我的話，我會知道的。你是呆瓜嗎?」"];
        
        // 根據求助次數，決定要問幾次問題
        for (let i = 0; i < this.bailoutCounter; i++) {
            questions.push(extraQuestions[i % extraQuestions.length]); // 循環使用額外問題
        }

        modal.messages = questions;
        modal.currentMessageIndex = 0;
        modal.onConfirm = () => this.executeBailout();
        modal.isOpen = true;
    },

    handleConstructionClick() {
        this.modals.construction.isOpen = true;

        // 【修改】對應新的步驟編號，現在檢查步驟2
        if (this.tutorial.active && this.tutorial.step === 2) {
            setTimeout(() => {
                this.advanceTutorial(3); // 推進到步驟3
            }, 100);
        }
    },
    
    handleRaidButtonClick() {
        const canRaid = this.buildings.dungeon.level > 0 && this.buildings.maternity.level > 0;

        if (canRaid) {
            this.screen = 'raid_selection';
            return;
        }
        
        // 【核心修改】無論如何，先彈出正常的提示
        this.showCustomAlert('必須先建造「地牢」與「產房」，為掠奪來的俘虜和新生兒做好準備，才能出擊！', () => {
            // 這個函式會在玩家按下提示框的「確定」後執行
            const isStuck = (this.buildings.dungeon.level === 0 || this.buildings.maternity.level === 0) &&
                            (this.resources.food < 200 || this.resources.wood < 200 || this.resources.stone < 200);

            if (isStuck) {
                this.handleBailoutRequest();
            }
        });
    },
    // 請在您的程式碼中新增這個函式
    continueNextDay() {
        // --- 商人來訪邏輯 ---
        if (this.merchant.isPresent) {
            this.merchant.stayDuration--;
            if (this.merchant.stayDuration <= 0) {
                this.logMessage('tribe', '旅行商人「世紀」已經收拾行囊，離開了你的部落。', 'info');
                this.merchant = {
                    dialogue: '',
                    isPresent: false,
                    goods: [],
                    stayDuration: 0,
                    purchases: this.merchant.purchases,
                    selectedItemIds: [],
                    selectedCaptiveIds: [],
                };
            }
        } else {
            if (this.day === 9 && !this.tutorial.merchantMet) {
                this.merchant.isPresent = true;
                this.merchant.stayDuration = 1 + (this.buildings.merchantCamp.level || 0);
                this.generateMerchantGoods();
                this.logMessage('tribe', `一位名叫「世紀」的魅魔商人來到了你的營地！她將停留 ${this.merchant.stayDuration} 天。`, 'success');
                this.advanceTutorial(7); // 這裡的教學步驟是7，不是6
                this.tutorial.merchantMet = true;
            } else if (this.day > 9) {
                const arrivalChance = [10, 15, 20, 25, 30][this.buildings.merchantCamp.level || 0] || 10;
                if (roll(arrivalChance)) {
                    this.merchant.isPresent = true;
                    this.merchant.stayDuration = 1 + (this.buildings.merchantCamp.level || 0);
                    this.generateMerchantGoods();
                    this.logMessage('tribe', `一位名叫「世紀」的魅魔商人來到了你的營地！她將停留 ${this.merchant.stayDuration} 天。`, 'success');
                }
            }
        }

        // --- 日常事件 ---
        this.day++;
        this.logMessage('tribe', `--- 第 ${this.day} 天 ---`, 'system');
        
        this.captives.forEach(c => {
            if (c.isPregnant) {
                c.pregnancyTimer--;
                if (c.pregnancyTimer <= 0) {
                    this.giveBirth(c);
                }
            }
        });

        const milkProduced = this.mothers.filter(m => !m.isPregnant).reduce((total, mother) => {
            return total + Math.floor((mother.stats.charisma || 0) * 1);
        }, 0);
        if (milkProduced > 0) {
            this.resources.food += milkProduced;
            this.logMessage('tribe', `產房的孕母們生產了 ${milkProduced} 單位食物。`, 'success');
        }
        
        this.resources.food -= this.dailyFoodConsumption;
        if (this.resources.food < 0) {
            if (!this.isStarving) {
                this.logMessage('tribe', `食物不足！部落成員陷入飢餓狀態，所有能力下降25%！`, 'enemy');
                this.isStarving = true;
            }
            this.resources.food = 0;
        } else {
            if (this.isStarving) {
                this.logMessage('tribe', `食物充足，飢餓狀態解除了。`, 'success');
                this.isStarving = false;
            }
        }
        
        this.player.updateHp(this.isStarving);
        this.partners.forEach(p => {
            p.maxHp = p.calculateMaxHp(this.isStarving);
            p.currentHp = Math.min(p.currentHp, p.maxHp);
        });

        this.calculateDispatchYields(); // 【新增】計算派遣收益
        this.breedingChargesLeft = this.totalBreedingCharges;
    },

    // 請用以下程式碼替換您原本的 nextDay 函式
    nextDay() {
        // --- 事件偵測階段 ---
        let pendingRevengeInfo = null;
        let pendingBirths = [];

        // 1. 偵測復仇小隊
        const captivesByDifficulty = {};
        this.captives.forEach(c => {
            if (!captivesByDifficulty[c.originDifficulty]) {
                captivesByDifficulty[c.originDifficulty] = 0;
            }
            captivesByDifficulty[c.originDifficulty]++;
        });

        for (const difficulty in captivesByDifficulty) {
            if (pendingRevengeInfo) break;
            const count = captivesByDifficulty[difficulty];
            const coefficient = REVENGE_DIFFICULTY_COEFFICIENT[difficulty] || 0;
            const triggerChance = count * coefficient;

            if (roll(triggerChance)) {
                pendingRevengeInfo = { difficulty: difficulty };
            }
        }

        // 2. 偵測新生兒 (僅用於傳遞)
        this.captives.forEach(c => {
            if (c.isPregnant) {
                c.pregnancyTimer--;
                if (c.pregnancyTimer <= 0) {
                    pendingBirths.push(c);
                } else {
                    // 將還沒到時間的 timer 加回去，避免重複計算
                    c.pregnancyTimer++; 
                }
            }
        });

        if (pendingRevengeInfo) {
            this.logMessage('tribe', `你從 ${pendingRevengeInfo.difficulty} 城鎮掠來的俘虜似乎引來了追兵...`, 'enemy');
            this.triggerRevengeSquadBattle(pendingRevengeInfo.difficulty, pendingBirths);
            return; // 中斷後續所有普通事件，交由戰鬥結束後處理
        }

        // 如果沒有復仇事件，則執行正常的日常流程
        this.continueNextDay();
    },
    
    getBuildingUpgradeCost(type) {
        const building = this.buildings[type];
        if (!building) return { food: 0, wood: 0, stone: 0};
        const level = building.level;
        const multiplier = Math.pow(2, level); // GDD註：地牢、倉庫、寢室、產房升級費用為前一級的兩倍

        switch(type) {
            case 'dungeon':
                if (level >= 6) return { food: Infinity, wood: Infinity, stone: Infinity };
                return { food: 50 * multiplier, wood: 100 * multiplier, stone: 100 * multiplier };
            case 'maternity':
                if (level >= 6) return { food: Infinity, wood: Infinity, stone: Infinity };
                return { food: 50 * multiplier, wood: 100 * multiplier, stone: 100 * multiplier };
            case 'warehouse':
                if (level >= 4) return { food: Infinity, wood: Infinity, stone: Infinity };
                return { food: 0, wood: 100 * multiplier, stone: 100 * multiplier }; // 初始花費 100木, 100礦
            case 'barracks':
                if (level >= 5) return { food: Infinity, wood: Infinity, stone: Infinity };
                if (level === 0) return { food: 100, wood: 150, stone: 150 }; // 初始花費
                    return { food: 100 * multiplier, wood: 150 * multiplier, stone: 150 * multiplier }; // 升級花費
            case 'armory':
                if (level >= 4) return { food: Infinity, wood: Infinity, stone: Infinity };
                if (level === 0) return { food: 0, wood: 150, stone: 150 };
                return { food: 0, wood: 150 * multiplier, stone: 150 * multiplier }; // 兵工廠升級費用沒有明確規則，暫定為兩倍
            case 'trainingGround':
                if (level === 0) return { food: 200, wood: 150, stone: 150 };
                return { food: Infinity, wood: Infinity, stone: Infinity }; // 訓練場無法升級
            case 'merchantCamp':
                    if (level >= 4) return { food: Infinity, wood: Infinity, stone: Infinity };
                if (level === 0) return { food: 200, wood: 200, stone: 200 };
                return { food: 200 * multiplier, wood: 200 * multiplier, stone: 200 * multiplier }; // 商人營地升級費用沒有明確規則，暫定為兩倍
            default:
                return {food: 0, wood: 0, stone: 0};
        }
    },
    canAffordBuildingUpgrade(type) {
        const cost = this.getBuildingUpgradeCost(type);
        const foodCost = cost.food || 0;
        return this.resources.food >= foodCost && this.resources.wood >= cost.wood && this.resources.stone >= cost.stone;
    },
    upgradeBuilding(type) {
        const building = this.buildings[type];
        const maxLevels = { dungeon: 6, warehouse: 4, barracks: 5, armory: 4, maternity: 6, merchantCamp: 4 };
        if (building.level >= maxLevels[type]) { this.showCustomAlert(`${building.name}已達到最大等級！`); return; }
        if (!this.canAffordBuildingUpgrade(type)) { this.showCustomAlert("資源不足！"); return; }
        
        const cost = this.getBuildingUpgradeCost(type);
        this.resources.food -= (cost.food || 0);
        this.resources.wood -= cost.wood;
        this.resources.stone -= cost.stone;
        building.level++;
        this.logMessage('tribe', `${building.name}${building.level === 1 ? '建造完成' : `升級至 ${building.level} 級`}！`, 'success');

        if (this.tutorial.active && type === 'armory' && building.level === 1 && !this.tutorial.finishedDecomposing) {
            this.triggerTutorial('armoryBuilt');
        }

        if (this.tutorial.active) {
            setTimeout(() => {
                // 【修改】對應新的步驟編號
                if (type === 'dungeon' && this.tutorial.step === 3 && building.level === 1) {
                    this.advanceTutorial(4);
                } 
                else if (type === 'maternity' && this.tutorial.step === 4 && building.level === 1) {
                    this.advanceTutorial(5);
                }
            }, 50);
        }
    },
    
    startBreedingNarrative() {
        // --- 準備並打開 AI 敘事視窗 (前置檢查已由 handleBreedingClick 完成) ---
        const modal = this.modals.narrative;
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCaptives = this.captives.filter(c => selectedIds.includes(c.id));

        // 【核心修改】準備好狀態
        modal.title = "繁衍";
        modal.type = "breeding";
        modal.isAwaitingConfirmation = true; // 預設為等待確認狀態
        modal.isLoading = false;
        modal.context = [];
        modal.currentCaptives = selectedCaptives;
        modal.hasBred = false;
        
        // 【核心修改】關閉當前視窗，並切換到新的專屬敘事畫面
        this.modals.construction.isOpen = false;
        this.screen = 'breeding_narrative'; 
    },
    confirmAndStartBreedingNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // 直接進入敘事階段
        modal.isLoading = true;
        this.generateNarrativeSegment('開始'); // 觸發第一段與繁衍相關的AI敘事
    },
    closeNarrativeModal() {
        if (this.modals.narrative.type === 'breeding' && this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
            this.nextDay();
        }
        
        if (this.modals.narrative.type === 'birth') {
            this.screen = 'tutorial_query';
        }

        // 【新增】對 tutorial 類型的處理
        if (this.modals.narrative.type === 'tutorial') {
            // 教學彈窗關閉後，不需要做任何特殊操作，直接關閉即可
        }

        this.modals.narrative.isOpen = false;
        // 可以在此處重置 modal 狀態以策安全
        this.modals.narrative.type = '';
        this.modals.narrative.content = '';
    },
    finalizeBreedingAndReturn() {
        if (this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
            this.nextDay();
        }
        // 呼叫新的共用函式
        this.returnToBreedingModal('繁衍已完成！');
    },
    executeQuickBreedingAndReturn() {
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        // 執行繁衍的核心遊戲機制
        selectedIds.forEach(id => {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
            }
        });

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        
        // 清理並觸發下一天
        this.modals.dungeon.selectedBreedIds = [];
        this.nextDay();

        // 【修改】返回部落畫面的同時，重新打開「部落建設」視窗
        this.screen = 'tribe';
        this.modals.construction.isOpen = true;

        // 【新增】為了更好的體驗，直接定位回繁衍分頁
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';

        // 【新增】顯示操作成功的提示框
        this.showCustomAlert('繁衍已完成！');
        
    },
    async confirmAndNarrateBreeding() {
        // 防止重複觸發
        if (this.modals.narrative.hasBred) return;

        // 【核心修改】在此處加入繁衍的遊戲機制
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;
        selectedIds.forEach(id => {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
            }
        });
        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');

        // 標記繁衍已完成
        this.modals.narrative.hasBred = true;

        // 命令 AI 生成對應的敘事文本
        await this.generateNarrativeSegment('繁衍');
    },
    async generateIntroNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // <<< 新增：關閉確認狀態
        modal.isLoading = true;
        modal.content = '';
        modal.title = "序幕";
        modal.type = "intro";
        const prompt = "來玩角色扮演遊戲。玩家於現實世界中抑鬱而終，當再次睜開雙眼，發現自己來到了一個劍與魔法的異世界。然而，並未成為勇者或魔王，而是轉生成了一隻最弱小的生物——哥布林。更奇怪的是，孤身一人，身邊沒有任何同伴。在這個對哥布林充滿敵意的世界，必須依靠自己，從零開始，建立只屬於自己的部落，向世界宣告哥布林王的崛起。請生成一段約150字的遊戲開場白，描述玩家是一位在現代社會中感到抑鬱與不滿的人，人生忽然迎來終點，張著眼，世界逐漸融化且意識逐漸模糊，漸漸感到冰冷，忽然就發現自己倒在另一個地方。風格請帶有黑暗奇幻的色彩。";
        
        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
        } catch (error) {
            modal.content = error.message;
        } finally {
            modal.isLoading = false;
        }
    },
    async generateBirthNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false; // <<< 新增
        modal.isLoading = true;
        modal.content = ''; // 清空提示文字

        const prompt = `玩家發現自己變成了哥布林。請根據以下新誕生的哥布林王資訊，生成一段約150字，黑暗奇幻風格的誕生故事。描述如何在一個陌生的世界甦醒，感受自己全新的、醜陋、非人而強大的哥布林身體，且需要繁衍以壯大自己的部落。\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm`;

        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
            this.narrativeMemory = text;
        } catch (error) {
            modal.content = error.message;
        } finally {
            modal.isLoading = false;
        }
    },
    async generateNarrativeSegment(action) {
        const modal = this.modals.narrative;
        modal.isLoading = true;
        modal.title = "繁衍";
        modal.type = "breeding";
        
        const captives = modal.currentCaptives;
        const isSoloScene = captives.length === 1 && this.player.party.length === 0;
        let prompt = '';
        
        const baseInstruction = "以哥布林王的視角，描寫一段與地牢俘虜的繁衍過程。";

        if (isSoloScene) {
            const captive = captives[0];
            const captiveDetails = `- 名稱: ${captive.name}, 職業: ${captive.profession}, 個性: ${captive.visual.personality}, 髮色: ${captive.visual.hairColor}, 髮型: ${captive.visual.hairStyle}, ${captive.visual.bust}罩杯, 身高 ${captive.visual.height}cm, 年紀 ${captive.visual.age}歲, 服裝: ${captive.visual.clothing}`;
            if (modal.context.length === 0) {
                prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n\n**女性俘虜資訊:**\n${captiveDetails}\n\n故事從哥布林王決定 "${action}" 開始。請詳細描寫地牢環境，以及哥布林王打牢房，進入到內。\n請撰寫一段約200-250字，充滿氣氛和細節的開場故事，以及女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\敘事描述每一個動作、行為、生理反應及雙方感受。`;
            } else {
                const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約100-200字），保持風格一致，並描寫女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
            }
        } else { // Group scene
            let captivesDetails = captives.map(c => `- 名稱: ${c.name}, 職業: ${c.profession}, 個性: ${c.visual.personality}, 髮色: ${c.visual.hairColor}, 髮型: ${c.visual.hairStyle}, ${c.visual.bust}罩杯, 身高 ${c.visual.height}cm, 年紀 ${c.visual.age}歲, 服裝: ${c.visual.clothing}`).join('\n');
            let partnersDetails = this.player.party.length > 0 ? `你的哥布林夥伴們 (${this.player.party.map(p => p.name).join(', ')}) 也一同參與。` : '';
            if (modal.context.length === 0) {
                prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n${partnersDetails}\n\n**女性俘虜資訊:**\n${captivesDetails}\n\n故事從哥布林王決定 "${action}" 開始。請詳細描寫地牢環境，以及哥布林王打牢房，進入到內。\n請撰寫一段約200-250字，充滿氣氛和細節的開場故事。哥布林王以及女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\敘事將描述每一個動作、行為、生理反應及雙方感受。`;
            } else {
                const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約100-200字），保持風格一致，並描寫女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
            }
        }

        modal.context.push({ user: action });

        try {
            const text = await this.callGeminiAPI(prompt, 0.5);
            modal.content = text.replace(/\n/g, '<br>');
            modal.context[modal.context.length - 1].model = text;
        } catch (error) {
            modal.content = error.message;
            modal.context.pop();
        } finally {
            modal.isLoading = false;
        }
    },
    async callGeminiAPI(prompt, temperature = 0.7) {
        // 【修改】如果沒有金鑰，則直接回傳提示訊息，不發出請求
        if (!this.userApiKey || this.userApiKey.trim() === '') {
            return "（AI 敘事功能需要 API 金鑰。請刷新頁面，在初始畫面中輸入您的金鑰。）";
        }

        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { 
            contents: chatHistory,
            generationConfig: {
                temperature: temperature
            }
        };
        // 【修改】使用玩家輸入的金鑰
        const apiKey = this.userApiKey; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // 如果 API 金鑰無效或出錯，也給予明確提示
            if (response.status === 400) {
                return "（您的 API 金鑰無效或已過期，請刷新頁面重新輸入。）";
            }
            // 【新增】處理請求頻率過高的錯誤
            if (response.status === 429) {
                return "（對AI的請求過於頻繁，已觸發流量限制，請稍後再試。）";
            }
            throw new Error(`API request failed with status ${response.status}`);
        }
        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected API response structure:", result);
            let errorMessage = "無法生成故事，可能是因為內容限制。";
            if (result.promptFeedback && result.promptFeedback.blockReason) {
                errorMessage += ` (原因: ${result.promptFeedback.blockReason})`;
            }
            return `（${errorMessage}）`; // 將錯誤訊息回傳到畫面上
        }
    },

    calculateProcChance(baseRate) {
        if (!this.player) return baseRate;
        const rawLuck = this.player.stats.luck; // 僅計算原始運氣值    
        const finalRate = baseRate + (rawLuck / 100) * 40;
        return Math.min(finalRate, baseRate + 40); // 確保運氣加成不超過40%
    },        
        
    giveBirth(mother) {
        // 【防禦性檢查】
        if (!mother || !mother.stats) {
            this.logMessage('tribe', `一名孕母的資料異常，本次生產失敗！`, 'enemy');
            if(mother) {
                mother.isPregnant = false;
                mother.pregnancyTimer = 0;
            }
            return;
        }

        // 提前創建新生兒，無論寢室是否已滿
        const pStats = this.player.stats;
        const mStats = mother.stats;
        const newStats = {
            strength: Math.floor(((pStats.strength || 0) + (mStats.strength || 0)) / 4 + (mStats.charisma || 0)),
            agility: Math.floor(((pStats.agility || 0) + (mStats.agility || 0)) / 4 + (mStats.charisma || 0)),
            intelligence: Math.floor(((pStats.intelligence || 0) + (mStats.intelligence || 0)) / 4 + (mStats.charisma || 0)),
            luck: Math.floor(((pStats.luck || 0) + (mStats.luck || 0)) / 4 + (mStats.charisma || 0))
        };
        const newName = `(${(mother.profession || '未知')}${(mother.name || '無名')}之子)哥布林`;
        const newPartner = new Goblin(newName, newStats);
        newPartner.maxHp = newPartner.calculateMaxHp(this.isStarving);
        newPartner.currentHp = newPartner.maxHp;

        // 檢查寢室容量
        if ((this.partners.length + 1) <= this.partnerCapacity) {
            // 容量充足，直接加入
            this.partners.push(newPartner);
            mother.isPregnant = false;
            mother.pregnancyTimer = 0;
            mother.isMother = true;
            this.player.skillPoints++;
            this.logMessage('tribe', `${mother.name} 誕下了一個新的哥布林夥伴：${newName}！你獲得了 1 點技能點。`, 'success');
            this.logMessage('tribe', `${mother.name} 現在開始在產房為部落貢獻奶水。`, 'info');
            if (this.tutorial.active && !this.tutorial.finishedPartyMgmt) {
                this.triggerTutorial('firstBirth');
            }
        } else {
            // 容量不足，將決策事件加入佇列
            this.logMessage('tribe', `${mother.name} 誕下了一個孩子，但寢室已滿！返回部落後需要您做出選擇...`, 'warning');
            this.pendingDecisions.push({
                type: 'partner',
                list: [...this.partners, newPartner],
                limit: this.partnerCapacity,
                dungeonLimit: -1,
                context: { mother: mother, newborn: newPartner }
            });
        }
    },

    // 【新增】這個全新的函式
    releaseCarriedCaptive(captiveId) {
        if (!this.currentRaid) return;

        const captiveIndex = this.currentRaid.carriedCaptives.findIndex(c => c.id === captiveId);
        
        if (captiveIndex > -1) {
            // 先取得俘虜的名字，用於日誌記錄
            const captiveName = this.currentRaid.carriedCaptives[captiveIndex].name;
            
            // 從列表中移除該俘虜
            this.currentRaid.carriedCaptives.splice(captiveIndex, 1);
            
            // 在掠奪日誌中記錄此事件
            this.logMessage('raid', `你釋放了俘虜 ${captiveName}。`, 'info');
        }
    },
    
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
            // 【新增】檢查地牢容量
            if (this.dungeonCaptives.length >= this.captiveCapacity) {
                this.showCustomAlert(`地牢空間已滿 ( ${this.dungeonCaptives.length} / ${this.captiveCapacity} )，無法移入更多俘虜！`);
                return;
            }
            captive.isMother = false;
            this.logMessage('tribe', `${captive.name} 已被移回地牢，等待繁衍。`, 'info');
        }
    },
    releasePartner(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;

        const itemsToReturn = Object.values(partner.equipment).filter(item => item !== null);

        if (itemsToReturn.length > 0) {
            const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
            
            if (itemsToReturn.length > availableSpace) {
                // 空間不足，打開處理視窗
                this.modals.itemManagement = {
                    isOpen: true,
                    title: `處理 ${partner.name} 的裝備`,
                    message: `倉庫與背包空間不足！請先處理以下裝備，直到剩餘數量小於等於 ${availableSpace}。`,
                    items: [...itemsToReturn], // 複製一份陣列
                    capacity: availableSpace,
                    onConfirm: () => {
                        this.finalizeReleasePartner(partner); // 設定確認後要執行的動作
                    }
                };
            } else {
                // 空間足夠，自動轉移
                itemsToReturn.forEach(item => {
                    if (this.warehouseInventory.length < this.warehouseCapacity) {
                        this.warehouseInventory.push(item);
                    } else {
                        this.player.inventory.push(item);
                    }
                });
                this.logMessage('tribe', `已將 ${partner.name} 的 ${itemsToReturn.length} 件裝備自動移至倉庫/背包。`, 'info');
                this.finalizeReleasePartner(partner);
            }
        } else {
            // 身上沒裝備，直接逐出
            this.finalizeReleasePartner(partner);
        }
    },

    finalizeReleasePartner(partner) {
        this.partners = this.partners.filter(p => p.id !== partner.id);
        this.player.party = this.player.party.filter(p => p.id !== partner.id);
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你將 ${partner.name} 逐出了部落。`, 'info');
    },

    executeItemManagementAction(action, itemId) {
        const modal = this.modals.itemManagement;
        const itemIndex = modal.items.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        const [item] = modal.items.splice(itemIndex, 1);

        if (action === 'decompose') {
            const material = item.material;
            const returnRate = [0.2, 0.3, 0.4, 0.5][this.buildings.armory.level - 1] || 0;
            const resourcesBack = Math.floor(material.cost * returnRate);

            if (material.type === 'metal') {
                this.resources.stone += resourcesBack;
                this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 礦石。`, 'info');
            } else {
                this.resources.wood += resourcesBack;
                this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 木材。`, 'info');
            }
        } else if (action === 'discard') {
            this.logMessage('tribe', `你丟棄了裝備 [${item.name}]。`, 'info');
        }
    },

    confirmItemManagement() {
        const modal = this.modals.itemManagement;
        if (modal.items.length > modal.capacity) {
            this.showCustomAlert('處理尚未完成！剩餘裝備數量仍大於可用空間。');
            return;
        }

        // 將剩餘決定保留的裝備放入倉庫/背包
        modal.items.forEach(item => {
            if (this.warehouseInventory.length < this.warehouseCapacity) {
                this.warehouseInventory.push(item);
            } else {
                this.player.inventory.push(item);
            }
        });
        this.logMessage('tribe', `你處理完畢，並保留了 ${modal.items.length} 件裝備。`, 'success');

        // 執行回呼函式 (例如：完成夥伴的逐出)
        if (typeof modal.onConfirm === 'function') {
            modal.onConfirm();
        }

        // 關閉並重置 modal
        modal.isOpen = false;
        modal.onConfirm = null;
        modal.items = [];
    },

    generateMerchantGoods() {
        const level = this.buildings.merchantCamp.level;
        const itemCounts = [2, 4, 6, 8, 10];
        const numItems = itemCounts[level] || 2;
        let goods = [];

        const materialTiers = { 0: [1,2], 1: [1,3], 2: [2,4], 3: [3,5], 4: [4,6] };
        const possibleTiers = materialTiers[level];

        for (let i = 0; i < numItems; i++) {
            // 決定品質
            const qualityRoll = randomInt(1, 100);
            let qualityKey = 'worn'; // 7%
            if (qualityRoll <= 5) qualityKey = 'legendary';       // 5%
            else if (qualityRoll <= 15) qualityKey = 'epic';      // 10%
            else if (qualityRoll <= 32) qualityKey = 'rare';      // 17%
            else if (qualityRoll <= 58) qualityKey = 'uncommon';  // 26%
            else if (qualityRoll <= 93) qualityKey = 'common';    // 35%

            // 決定材質
            const isMetal = roll(50);
            const tier = randomInt(possibleTiers[0], possibleTiers[1]);
            const materialType = isMetal ? 'metal' : 'wood';
            const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => 
                EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType
            );
            if (!materialKey) continue;

            // 決定裝備類型
            const randomItemType = this.craftableTypes[randomInt(0, this.craftableTypes.length - 1)];
            const newItem = this.createEquipment(materialKey, qualityKey, randomItemType.baseName);
            goods.push(newItem);
        }
        this.merchant.goods = goods;
    },
    confirmPartySelection() {
        this.player.party = this.partners.filter(p => this.modals.barracks.selectedPartyIds.includes(p.id));
        this.player.updateHp(this.isStarving);
        this.logMessage('tribe', `你更新了出擊隊伍，現在有 ${this.player.party.length} 名夥伴與你同行。`, 'info');

        // 【新增】顯示一個提示框，告知玩家操作成功，增加操作回饋
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

    raidOptions: [
        { difficulty: 'easy', name: '簡單', description: '居民(15-20), 守軍(5-10)' },
        { difficulty: 'normal', name: '普通', description: '居民(20-25), 守軍(10-15)' },
        { difficulty: 'hard', name: '困難', description: '居民(25-30), 守軍(15-20)' },
        { difficulty: 'hell', name: '地獄', description: '居民(30-35), 守軍(20-25)' },
    ],
    startRaid(difficulty) {
        // 【修改】將步驟判斷從 4 改為 5，並將下一步指向 5.5
        if (this.tutorial.active && this.tutorial.step === 5) {
            if (difficulty !== 'easy') {
                this.showCustomAlert('王，您的勇氣可嘉。那麼，您自己看著辦吧。引導教學將在部落中等您歸來。');
                this.tutorial.active = false;
            } else {
                this.advanceTutorial(5.5); // 推進到偵查環境的提示
            }
        }

        if (this.buildings.dungeon.level === 0) {
            this.showCustomAlert('地牢尚未建造，無法發動掠奪來抓捕俘虜！');
            return;
        }
        this.currentRaid = this.generateCity(difficulty);
        this.currentRaid.reinforcementsDefeated = false;
        this.screen = 'raid';
        this.logMessage('raid', `你帶領隊伍前往 ${this.currentRaid.locationName} 進行掠奪！`, 'player');
    },

    triggerRevengeSquadBattle(difficulty, pendingBirths = []) {
        this.postBattleBirths = pendingBirths;

        this.showCustomAlert('警報！一支由騎士和民兵組成的復仇小隊襲擊了你的部落！');

        // 【修改】新的隊伍組成，包含騎士團和居民
        const squadCompositions = {
            easy:   { knights: { '士兵': 1, '盾兵': 1 }, residents: 4 },
            normal: { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1 }, residents: 5 },
            hard:   { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1, '騎士': 1, '法師': 1 }, residents: 6 },
            hell:   { knights: { '士兵': 3, '盾兵': 2, '槍兵': 2, '弓兵': 1, '騎士': 1, '法師': 1, '祭司': 1 }, residents: 7 }
        };
        
        const knightStatRanges = {
            easy: [80, 150], normal: [150, 240], hard: [240, 350], hell: [350, 450]
        };
        const residentStatRanges = {
            easy: [20, 20], normal: [20, 40], hard: [40, 80], hell: [80, 160]
        };

        const composition = squadCompositions[difficulty];
        const knightStatRange = knightStatRanges[difficulty];
        const residentStatRange = residentStatRanges[difficulty];
        let revengeSquad = [];

        // 【新增】生成騎士團成員
        for (const unitType in composition.knights) {
            for (let i = 0; i < composition.knights[unitType]; i++) {
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                const unit = roll(50) 
                    ? new FemaleKnightOrderUnit(unitType, totalStatPoints, difficulty)
                    : new KnightOrderUnit(unitType, totalStatPoints, difficulty);
                this.equipEnemy(unit, difficulty);
                revengeSquad.push(unit);
            }
        }

        // 【新增】生成居民（民兵）
        for (let i = 0; i < composition.residents; i++) {
            const totalStatPoints = randomInt(residentStatRange[0], residentStatRange[1]);
            const unit = roll(50)
                ? new FemaleHuman("復仇的居民", distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']), '居民', generateVisuals(), difficulty)
                : new MaleHuman("復仇的居民", distributeStats(totalStatPoints), '居民', difficulty);
            this.equipEnemy(unit, difficulty);
            revengeSquad.push(unit);
        }
        
        this.combat.isReinforcementBattle = true;
        this.startCombat(revengeSquad, true);
    },

    generateCity(difficulty) {
        const config = {
            // 【修改】更新各難度的居民 (pop) 數量
            easy:    { time: 300, zones: ['外城', '內城'], pop: [10, 15], guards: [5, 10], knightStats: [80, 150] },
            normal: { time: 240, zones: ['外城', '內城A', '內城B'], pop: [15, 25], guards: [10, 15], knightStats: [150, 240] },
            hard:    { time: 180, zones: ['外城', '內城A', '內城B', '內城C'], pop: [25, 30], guards: [15, 20], knightStats: [240, 350] },
            hell:    { time: 120, zones: ['外城', '內城A', '內城B', '內城C', '王城'], pop: [35, 40], guards: [20, 25], knightStats: [350, 450] }
        };
        const cityConfig = config[difficulty];
        const nameConfig = CITY_NAMES[difficulty];
        const locationName = nameConfig.prefixes[randomInt(0, nameConfig.prefixes.length - 1)] + nameConfig.suffix;

        let city = {
            difficulty, locationName, timeRemaining: cityConfig.time, zones: [],
            currentZoneIndex: 0,
            get currentZone() { return this.zones[this.currentZoneIndex]; },
            carriedCaptives: [],
            failedSneakTargets: new Set()
        };

        city.zones = cityConfig.zones.map(name => ({
            name: name, scouted: { environment: false, targets: new Set() },
            buildings: [], enemies: [],
            resources: { food: 0, wood: 0, stone: 0 }
        }));
        
        const gridCols = Math.floor(MAP_WIDTH / GRID_SIZE);
        const gridRows = Math.floor(MAP_HEIGHT / GRID_SIZE);
        // 【修改】為每個 zone 建立獨立的 grid，避免跨層干擾
        city.zones.forEach(zone => {
            zone.placementGrid = Array(gridRows).fill(null).map(() => Array(gridCols).fill(null));
        });

        const paddingTop = 60;
        const paddingBottom = 40;
        
        const getFreePosition = (zone, isBuilding = false) => {
            let attempts = 0;
            while(attempts < 50) {
                const r = randomInt(0, gridRows - 1);
                const c = randomInt(0, gridCols - 1);
                const potentialY = r * GRID_SIZE + (GRID_SIZE / 4);

                if (potentialY < paddingTop || potentialY > MAP_HEIGHT - paddingBottom) {
                    attempts++;
                    continue;
                }
                
                if (!zone.placementGrid[r][c]) {
                    zone.placementGrid[r][c] = isBuilding ? 'building' : 'unit'; 
                    return { 
                        x: c * GRID_SIZE + (GRID_SIZE / 4), 
                        y: potentialY
                    };
                }
                attempts++;
            }
            const safeMapHeight = MAP_HEIGHT - paddingTop - paddingBottom;
            return { 
                x: randomInt(20, MAP_WIDTH - 20), 
                y: randomInt(paddingTop, paddingTop + safeMapHeight)
            };
        };

        const totalResidents = randomInt(cityConfig.pop[0], cityConfig.pop[1]);
        const totalGuards = randomInt(cityConfig.guards[0], cityConfig.guards[1]);

        let allGuards = Array.from({ length: totalGuards }, () => {
            const statRange = ENEMY_STAT_RANGES[difficulty].guard;
            const totalStatPoints = randomInt(statRange[0], statRange[1]);
            const isFemale = roll(50);
            
            let guard; // 先宣告一個變數來存放守軍
            if (isFemale) {
                guard = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length-1)], distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']), '城市守軍', generateVisuals(), difficulty);
            } else {
                guard = new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length-1)], distributeStats(totalStatPoints), '城市守軍');
            }

            this.equipEnemy(guard, difficulty); // 【核心修正】為生成的守軍呼叫裝備函式

            return guard; // 最後返回這個已經穿好裝備的守軍
        });
        
        let allResidents = Array.from({ length: totalResidents }, () => {
            const statRange = ENEMY_STAT_RANGES[difficulty].resident;
            const isFemale = roll(50);
            if (isFemale) {
                const profession = PROFESSIONS[randomInt(0, PROFESSIONS.length - 1)];
                return new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1]), ['strength', 'agility', 'intelligence', 'luck', 'charisma']), profession, generateVisuals(), difficulty);
            } else {
                return new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1])), '男性居民');
            }
        });

        const outerGuardsCount = Math.floor(totalGuards * 0.25);
        const outerGuards = allGuards.slice(0, outerGuardsCount);
        const innerGuards = allGuards.slice(outerGuardsCount);

        if (outerGuards.length > 0) {
            const pos = getFreePosition(city.zones[0], true);
            city.zones[0].buildings.push({ 
                id: crypto.randomUUID(), type: '衛兵所', occupants: outerGuards, looted: false, resources: { food: 0, wood: 0, stone: 0 },
                scouted: false, postScoutText: '',
                x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
            });
        }
        
        const innerZones = city.zones.filter(z => z.name !== '外城' && z.name !== '王城');
        
        if (innerZones.length > 0) {
            let currentGuardIndex = 0;
            while(currentGuardIndex < innerGuards.length) {
                const groupSize = randomInt(2, 3);
                const patrolTeam = innerGuards.slice(currentGuardIndex, currentGuardIndex + groupSize);
                if (patrolTeam.length > 0) {
                    const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                    const pos = getFreePosition(targetZone);
                    patrolTeam.forEach(unit => { unit.x = pos.x; unit.y = pos.y; });
                    targetZone.enemies.push(patrolTeam);
                }
                currentGuardIndex += groupSize;
            }
        }
        
        const buildingCount = Math.ceil(totalResidents / 1.5);
        if (innerZones.length > 0) {
            for (let i = 0; i < buildingCount; i++) {
                const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                const pos = getFreePosition(targetZone, true);
                targetZone.buildings.push({
                    id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                    occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                    scouted: false, postScoutText: '',
                    x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                });
            }
        }

        // 【新增】確保每層建築不少於3棟的邏輯
        innerZones.forEach(zone => {
            while (zone.buildings.length > 0 && zone.buildings.length < 3) {
                    const pos = getFreePosition(zone, true);
                    zone.buildings.push({
                    id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                    occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                    scouted: false, postScoutText: '',
                    x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                });
            }
        });

        const allInnerBuildings = innerZones.flatMap(z => z.buildings);
        allResidents.forEach(resident => {
            let finalUnit = resident;
            if(roll(5)) {
                const knightStatRange = cityConfig.knightStats;
                const knightTypes = Object.keys(KNIGHT_ORDER_UNITS);
                const randomKnightType = knightTypes[randomInt(0, knightTypes.length - 1)];
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                finalUnit = roll(50) ? new FemaleKnightOrderUnit(randomKnightType, totalStatPoints, difficulty) : new KnightOrderUnit(randomKnightType, totalStatPoints);
            }

            this.equipEnemy(finalUnit, difficulty);

            if (roll(80) && allInnerBuildings.length > 0) {
                const randomBuilding = allInnerBuildings[randomInt(0, allInnerBuildings.length - 1)];
                randomBuilding.occupants.push(finalUnit);
            } else if (innerZones.length > 0) {
                const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                const pos = getFreePosition(targetZone);
                finalUnit.x = pos.x;
                finalUnit.y = pos.y;
                targetZone.enemies.push([finalUnit]);
            }
        });

        const royalCityZone = city.zones.find(z => z.name === '王城');
        if (difficulty === 'hell' && royalCityZone) {
            // [重要] 清空王城，確保只有我們的特殊建築
            royalCityZone.enemies = [];
            royalCityZone.buildings = [];

            let castleOccupants = [];
            
            // 1. 生成 GDD 中定義的七位騎士團成員 (各兵種一名)
            const knightStatRange = cityConfig.knightStats;
            const knightTypes = Object.keys(KNIGHT_ORDER_UNITS); // ['士兵', '盾兵', '槍兵', '弓兵', '騎士', '法師', '祭司']

            knightTypes.forEach(unitType => {
                if (!KNIGHT_ORDER_UNITS[unitType]) return; // 避免未定義的兵種
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                // 50% 機率生成女性騎士 [cite: 89]
                const knight = roll(50) 
                    ? new FemaleKnightOrderUnit(unitType, totalStatPoints) 
                    : new KnightOrderUnit(unitType, totalStatPoints);
                castleOccupants.push(knight);
            });

            // 2. [修正] 根據 GDD 6.5 與 10.3 產生 1 至 3 位公主
            const numPrincesses = randomInt(1, 3); // [修正] 公主數量為1-3人

            for (let i = 0; i < numPrincesses; i++) {
                const princessStats = {
                    strength: 20,
                    agility: 20,
                    intelligence: 20,
                    luck: 20,
                    charisma: randomInt(200, 300)
                };
                const princess = new FemaleHuman(
                    // 為多位公主取不同的名字
                    `${FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length-1)]}公主`,
                    princessStats, 
                    '公主', 
                    generateVisuals()
                );
                castleOccupants.push(princess);
            }
            
            // 3. 創建城堡建築，將所有單位放入 (總人數為 7 + 公主數量)
            const pos = { x: (MAP_WIDTH / 2) - (GRID_SIZE / 2), y: 100 };
            royalCityZone.buildings.push({
                id: crypto.randomUUID(),
                type: '城堡',
                occupants: castleOccupants,
                looted: false,
                resources: { food: 500, wood: 500, stone: 500 },
                scouted: false, 
                postScoutText: '',
                isFinalChallenge: true, // [關鍵] 特殊標記
                x: pos.x, 
                y: pos.y, 
                width: GRID_SIZE,
                height: GRID_SIZE 
            });
        }
        //各難度資源量
        const resConfig = {
            easy: { food: [100, 200], wood: [50, 100], stone: [50, 100] },
            normal: { food: [200, 400], wood: [100, 200], stone: [100, 200] },
            hard: { food: [400, 800], wood: [200, 400], stone: [200, 400] },
            hell: { food: [800, 1600], wood: [400, 800], stone: [400, 800] }
        };
        const totalFood = randomInt(resConfig[difficulty].food[0], resConfig[difficulty].food[1]);
        const totalWood = randomInt(resConfig[difficulty].wood[0], resConfig[difficulty].wood[1]);
        const totalStone = randomInt(resConfig[difficulty].stone[0], resConfig[difficulty].stone[1]);

        const allCityBuildings = city.zones.flatMap(z => z.buildings);
        if(allCityBuildings.length > 0) {
            for(let i = 0; i < totalFood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.food++;
            for(let i = 0; i < totalWood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.wood++;
            for(let i = 0; i < totalStone; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.stone++;
        }

        city.zones.forEach(zone => {
            zone.resources.food = zone.buildings.reduce((sum, b) => sum + b.resources.food, 0);
            zone.resources.wood = zone.buildings.reduce((sum, b) => sum + b.resources.wood, 0);
            zone.resources.stone = zone.buildings.reduce((sum, b) => sum + b.resources.stone, 0);
        });

        return city;
    },
    enterThroneRoom(units) {
        this.logMessage('raid', '你推開城堡沉重的大門，踏入了決定命運的「王座之間」！', 'system');
        this.throneRoomUnits = units;
        this.screen = 'throne_room';
    },

    scoutThroneUnit(unit) {
        this.modals.throneScout.unit = unit;
        this.modals.throneScout.isOpen = true;
    },

    getThroneUnitDialogue(unit) {
        if (!unit) return '';
        const dialogues = {
            '公主': '「汝，為哥布林之王？竟敢踏足此地！」',
            '士兵': '「以王國之名，我將斬殺你的野望！」',
            '盾兵': '「這面盾牌將是你無法逾越的絕壁！」',
            '槍兵': '「看來你運氣不太好呀...長槍將貫穿你的野心！」',
            '弓兵': '「你無處可逃！箭矢將終結你！」',
            '騎士': '「為了公主與王國的榮耀，我將在此斬除邪惡！」',
            '法師': '「感受元素的憤怒吧，卑劣的生物！」',
            '祭司': '「汙穢的生物，面對你的罪行吧！」'
        };
        return dialogues[unit.profession] || '「......」';
    },

    startFinalBattle() {
        this.logMessage('raid', '最終決戰的號角響起！', 'enemy');
        this.modals.throneScout.isOpen = false;
        this.startCombat(this.throneRoomUnits, true);
    },
    scoutEnvironment() {
        const successChance = 90 + (this.player.getTotalStat('intelligence', this.isStarving) * 1) + (this.player.party.length + 1) - (this.currentRaid.currentZoneIndex * 10);
        if(roll(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            this.currentRaid.currentZone.scouted.environment = true;
            this.logMessage('raid', `環境偵查成功！(-3 分鐘)`, 'success');
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `環境偵查失敗！(-6 分鐘)`, 'enemy');
        }
        this.checkRaidTime();

        // 【核心修正】將步驟判斷從 4.5 改為 5.5
        if (this.tutorial.active && this.tutorial.step === 5.5) {
            this.tutorial.step = 0; // 暫時結束教學，等待玩家自行探索後返回部落觸發下一步
            this.showCustomAlert('很好，王。現在您可以自由行動了，試著擊敗敵人、擄走女性，或者搜刮資源，然後『脫離城鎮』返回部落吧。');
        }
    },
    // --- 請將舊的 scoutTarget 函數完整刪除，並貼上這個新版本 ---
    scoutTarget(targetOrGroup) {
        // 安全檢查，防止目標為空
        if (!targetOrGroup || (Array.isArray(targetOrGroup) && targetOrGroup.length === 0)) {
            this.showCustomAlert("偵查目標無效！");
            console.error("錯誤：偵查的目標為空，無法繼續。");
            return;
        }

        const isGroup = Array.isArray(targetOrGroup);
        // 【修正】無論是單體還是群組，都先取出第一個單位來進行偵查判定
        const representativeTarget = isGroup ? targetOrGroup[0] : targetOrGroup;

        // 如果代表目標已經被偵查過，直接開啟情報視窗
        if (this.isTargetScouted(representativeTarget.id)) {
            this.modals.scoutInfo.target = targetOrGroup; // 視窗顯示的是完整的群組
            this.modals.scoutInfo.isOpen = true;
            return;
        }

        // --- 偵查成功率計算 ---
        const playerIntel = this.player.getTotalStat('intelligence', this.isStarving);
        // 【修正】使用整個群組的平均智力來計算，而非只看第一個
        let enemyAvgIntel = 0;
        if (isGroup) {
            const totalIntel = targetOrGroup.reduce((sum, unit) => sum + (unit.stats.intelligence || 0), 0);
            enemyAvgIntel = totalIntel > 0 ? totalIntel / targetOrGroup.length : 0;
        } else {
            enemyAvgIntel = representativeTarget.stats.intelligence || 0;
        }
        
        const successChance = 70 + (playerIntel - enemyAvgIntel) * 2 + (this.player.party.length + 1);
        
        // --- 執行偵查 ---
        if (roll(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            // 【修正】將群組內所有單位的ID都標記為已偵查
            const targetsToMark = isGroup ? targetOrGroup : [representativeTarget];
            targetsToMark.forEach(t => this.currentRaid.currentZone.scouted.targets.add(t.id));

            this.logMessage('raid', `你成功偵查了 ${isGroup ? '一個隊伍' : representativeTarget.name} 的詳細情報！(-3 分鐘)`, 'success');
            
            // 開啟情報視窗
            this.modals.scoutInfo.target = targetOrGroup;
            this.modals.scoutInfo.isOpen = true;
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `偵查 ${isGroup ? '一個隊伍' : representativeTarget.name} 失敗！(-6 分鐘)`, 'enemy');
        }
        this.checkRaidTime();
    },
    
    isTargetScouted(targetId) {
        if (!this.currentRaid) return false;
        return this.currentRaid.currentZone.scouted.targets.has(targetId);
    },
    lootBuilding(building) {
        if(building.looted) return;

        // --- 【新增】搜刮時被巡邏隊發現的機制 ---
        const zone = this.currentRaid.currentZone;
        const isInnerCity = zone.name.includes('內城') || zone.name === '王城';
        const patrolsExist = zone.enemies && zone.enemies.length > 0;

        // 規則：只在內城/王城，且還有巡邏隊時，才進行此判斷
        if (isInnerCity && patrolsExist) {
            const patrolGroupCount = zone.enemies.length;
            const totalBuildingCount = zone.buildings.length;
            
            if (totalBuildingCount > 0) {
                // 根據 GDD 公式計算發現機率
                const discoveryChance = (patrolGroupCount / (totalBuildingCount * 4)) * 100;

                if (roll(discoveryChance)) {
                    this.logMessage('raid', `你搜刮 ${building.type} 的聲音太大，驚動了附近的一支巡邏隊！`, 'enemy');
                    
                    // 隨機選擇一支巡邏隊進行戰鬥
                    const patrolToFight = zone.enemies[randomInt(0, patrolGroupCount - 1)];
                    
                    // 開始一場強制戰鬥（敵人先攻）
                    this.startCombat(patrolToFight, true);
                    
                    // 【重要】中斷搜刮，玩家不會獲得資源
                    return; 
                }
            }
        }

        this.currentRaid.timeRemaining -= 3;

        const foodFound = building.resources.food;
        const woodFound = building.resources.wood;
        const stoneFound = building.resources.stone;
        
        this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodFound);
        this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodFound);
        this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneFound);

        building.looted = true;
        building.postScoutText = ' (空)';
        building.resources = { food: 0, wood: 0, stone: 0 };
        
        this.currentRaid.currentZone.resources.food -= foodFound;
        this.currentRaid.currentZone.resources.wood -= woodFound;
        this.currentRaid.currentZone.resources.stone -= stoneFound;
        
        this.logMessage('raid', `搜刮了 ${building.type} (-3 分鐘)，找到食物 ${foodFound}, 木材 ${woodFound}, 礦石 ${stoneFound}。`, 'success');
        
        const finalDropRate = 20 * (1 + this.player.getTotalStat('luck') / 100 * 0.5);
        if (roll(finalDropRate)) {
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.logMessage('raid', `你的背包已滿，無法拾取新的裝備！`, 'enemy');
                this.checkRaidTime(); // 即使背包滿了也要檢查時間
                return;
            }
            const materialTiers = {
                easy: { metal: [1, 3], wood: [1, 3] },
                normal: { metal: [2, 4], wood: [2, 4] },
                hard: { metal: [3, 5], wood: [3, 5] },
                hell: { metal: [4, 6], wood: [4, 6] },
            };
            const raidDifficulty = this.currentRaid.difficulty;
            const possibleTiers = materialTiers[raidDifficulty];
            const isMetal = roll(50);
            const tierRange = isMetal ? possibleTiers.metal : possibleTiers.wood;
            const tier = randomInt(tierRange[0], tierRange[1]);
            const materialType = isMetal ? 'metal' : 'wood';
            const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType);
            
            if (!materialKey) {
                this.checkRaidTime();
                return;
            }

            const qualityKey = ['common', 'uncommon'][randomInt(0, 1)];
            
            const randomItemType = this.craftableTypes[randomInt(0, this.craftableTypes.length - 1)];
            const newItem = this.createEquipment(materialKey, qualityKey, randomItemType.baseName);

            this.player.inventory.push(newItem);
            this.logMessage('raid', `你在廢墟中找到了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');
        }
        
        this.checkRaidTime();
    },
    canAdvance() {
        if (this.currentRaid && this.currentRaid.currentZone.name === '王城') {
            const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
            // 只有在城堡被偵查後，才允許前進
            return castle && castle.scouted;
        }
        return this.currentRaid && this.currentRaid.currentZoneIndex < this.currentRaid.zones.length - 1 && this.currentRaid.currentZone.enemies.flat().filter(e => e.profession === '城市守軍').length === 0 && this.currentRaid.currentZone.buildings.every(b => b.occupants.filter(o => o.profession === '城市守軍').length === 0);
    },
    advanceToNextZone(force = false) {
        const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
        if (this.currentRaid.currentZone.name === '王城' && castle && castle.scouted) {
            // [關鍵] 呼叫新函數，而不是移動到下一個zone
            this.enterThroneRoom(castle.occupants);
            return;
        }
        if (!this.canAdvance() && !force) {
            this.showCustomAlert('必須先清除此區域的守軍才能前進！');
            return;
        }
        this.currentRaid.timeRemaining -= 5;
        this.currentRaid.currentZoneIndex++;
        this.logMessage('raid', `你深入到了 ${this.currentRaid.currentZone.name}。(-5 分鐘)`, 'player');
    },
    sneakPastGuards() {
        if (!this.currentRaid || this.currentRaid.currentZoneIndex !== 0) return;
        const guardPost = this.currentRaid.currentZone.buildings.find(b => b.type === '衛兵所');
        if (!guardPost || guardPost.occupants.length === 0) {
            this.showCustomAlert('外城沒有守軍可以繞過。');
            return;
        }

        const outerGuards = guardPost.occupants;
        const playerAgility = this.player.getTotalStat('agility', this.isStarving);
        const enemyAvgAgility = outerGuards.reduce((sum, e) => sum + e.stats.agility, 0) / outerGuards.length;
        const successChance = 50 + (playerAgility - enemyAvgAgility) * 1.5 - ((this.player.party.length + 1) - outerGuards.length) * 2;

        if (roll(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行成功！你花費了 3 分鐘，悄悄地繞過了守軍。`, 'success');
            this.advanceToNextZone(true);
            this.checkRaidTime();
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `潛行失敗！你被守軍發現了！(-6 分鐘)`, 'enemy');
            this.startCombat(outerGuards, !this.isTargetScouted(outerGuards[0].id));
            this.checkRaidTime();
        }
    },
    handleRetreatAction() {
        if (!this.currentRaid) return;

        if (this.currentRaid.currentZoneIndex === 0) {
            
            const baseCost = 5;
            const captiveCost = (this.currentRaid.carriedCaptives.length || 0) * 5;
            const totalCost = baseCost + captiveCost;
            
            this.currentRaid.timeRemaining -= totalCost;
            
            this.logMessage('raid', `你帶著 ${this.currentRaid.carriedCaptives.length} 名俘虜脫離城鎮，花費了 ${totalCost} 分鐘。`, 'player');
            
            this.isRetreatingWhenTimeExpired = true; // 【新增此行】在檢查時間前，標記為正在脫離
            this.checkRaidTime(); 
            
            if (this.currentRaid && this.currentRaid.timeRemaining > 0) {
                this.prepareToEndRaid();
            }
            
        } else {
            // 否則，撤退回上一層区域
            const oldZoneName = this.currentRaid.currentZone.name;
            this.currentRaid.currentZoneIndex--; // 區域索引減 1
            this.currentRaid.timeRemaining -= 5; // 消耗 5 分鐘
            const newZoneName = this.currentRaid.currentZone.name;
            
            this.logMessage('raid', `你從 ${oldZoneName} 撤退回了 ${newZoneName}。(-5 分鐘)`, 'player');
            this.checkRaidTime(); // 檢查時間是否耗盡
        }
    },
    prepareToEndRaid(wasDefeated = false) {
        if (wasDefeated) {
            this.endRaid(true); // 如果是戰敗，直接跳到結束流程
            return;
        }
        
        const newCaptives = this.currentRaid.carriedCaptives;
        const currentDungeonCaptives = this.dungeonCaptives;

        // 【修改】新的觸發條件：當地牢的現有人 + 新抓的人 > 地牢容量時
        if (currentDungeonCaptives.length + newCaptives.length > this.captiveCapacity) {
            
            this.logMessage('tribe', '你帶回的俘虜過多，地牢無法容納！你需要從現有和新增的俘虜中決定去留...', 'warning');

            // 【修改】只將「原地牢俘虜」和「新抓的俘虜」放入選擇列表
            this.openCaptiveManagementModal(
                'raid_return', // 使用一個新的類型來區分這個特殊情境
                [...currentDungeonCaptives, ...newCaptives],
                this.captiveCapacity // 上限為地牢的容量
            );
        } else {
            // 容量充足，直接結束掠奪
            this.endRaid(false);
        }
    },
    endRaid(wasDefeated = false) {
        // 判斷是否為玩家戰敗死亡
        if (wasDefeated && this.player && !this.player.isAlive()) {
            this.initiateRebirth(); // 觸發重生流程
            this.selectedTarget = null; // 【新增】確保清除地圖目標
            return; // 中斷後續的返回部落邏輯
        }

        if (this.tutorial.active) {
            if(this.currentRaid.carriedCaptives.length > 0) {
                this.advanceTutorial(6);
            } else {
                this.tutorial.active = false;
                this.tutorial.step = 0;
                this.showCustomAlert('王，您平安歸來了。雖然這次沒有戰利品，但您已熟悉了流程。接下來，請自由探索這個世界吧！');
            }
        }

        if (!wasDefeated) {
            this.captives.push(...this.currentRaid.carriedCaptives);
            this.logMessage('tribe', `你帶回了 ${this.currentRaid.carriedCaptives.length} 名俘虜。`, 'player');
        }
        
        this.currentRaid = null;
        // 【新增】重置掠奪地圖上被選中的目標
        this.selectedTarget = null; 
        
        this.screen = 'tribe';
        
        this.player.currentHp = this.player.maxHp;
        this.partners.forEach(p => p.currentHp = p.maxHp);
        this.logMessage('tribe', '所有夥伴的生命值都已完全恢復。', 'success');

        this.finalizeRaidReturn();
    },
    finalizeRaidReturn() {
        this.currentRaid = null;
        this.screen = 'tribe';
        
        // 恢復所有單位生命值
        this.player.currentHp = this.player.maxHp;
        this.partners.forEach(p => p.currentHp = p.maxHp);
        this.logMessage('tribe', '所有夥伴的生命值都已完全恢復。', 'success');

        // 呼叫換日，這會增加天數並重置繁衍次數
        this.nextDay();
    },

    checkRaidTime() {
        if (this.currentRaid && this.currentRaid.timeRemaining <= 0) {
            if (this.screen === 'combat') {
                this.raidTimeExpired = true; // 在戰鬥中時間歸零，僅設定標記
            } else if (!this.currentRaid.reinforcementsDefeated) {
                this.triggerReinforcementBattle();
            }
        }
    },

    executeSneakKidnapFromModal() {
        if (!this.modals.scoutInfo.target || !Array.isArray(this.modals.scoutInfo.target)) return;

        const group = this.modals.scoutInfo.target;
        // 找到群組中第一位活著的女性作為目標
        const targetFemale = group.find(unit => unit.visual && unit.isAlive());

        if (targetFemale) {
            // 檢查是否已對此目標潛行失敗過
            if (this.currentRaid.failedSneakTargets.has(targetFemale.id)) {
                this.showCustomAlert(`你已經對 ${targetFemale.name} 潛行失敗過一次，再次嘗試會被直接發現！`);
                return;
            }
            this.modals.scoutInfo.isOpen = false; // 執行前關閉視窗
            this.sneakKidnap(targetFemale, group); // 呼叫核心潛行邏輯
        } else {
            this.showCustomAlert('找不到可下手的目標。');
        }
    },

    executeSneakKidnapFromMap() {
        if (!this.selectedTarget || !Array.isArray(this.selectedTarget)) return;

        const group = this.selectedTarget;
        const targetFemale = group.find(unit => unit.visual && unit.isAlive());

        if (targetFemale) {
            if (this.currentRaid.failedSneakTargets.has(targetFemale.id)) {
                this.showCustomAlert(`你已經對 ${targetFemale.name} 潛行失敗過一次，再次嘗試會被直接發現！`);
                return;
            }
            this.selectedTarget = null; // 執行前清除選取，隱藏選單
            this.sneakKidnap(targetFemale, group);
        } else {
            // 這個訊息理論上不會出現，因為按鈕的 x-show 已經過濾掉了
            this.showCustomAlert('該隊伍中沒有可下手的目標。');
        }
    },

    // 新增函數：觸發騎士團增援戰
    triggerReinforcementBattle() {
        if (!this.currentRaid) return; // 安全檢查

        this.logMessage('raid', '時間已到！王國騎士團的增援部隊抵達了城鎮！', 'enemy');

        // 根據 GDD 6.3 規則生成騎士團隊伍
        const difficulty = this.currentRaid.difficulty;
        let knightSquad = [];
        const squadComposition = {
            easy:   { '士兵': 3, '盾兵': 2 },
            normal: { '士兵': 4, '盾兵': 3, '槍兵': 2, '弓兵': 1 },
            hard:   { '士兵': 5, '盾兵': 3, '槍兵': 3, '弓兵': 2, '騎士': 1, '法師': 1 },
            hell:   { '士兵': 6, '盾兵': 4, '槍兵': 4, '弓兵': 2, '騎士': 2, '法師': 1, '祭司': 1 }
        };
        const knightStatRanges = {
            easy: [80, 150],
            normal: [150, 240],
            hard: [240, 350],
            hell: [350, 450]
        };

        const composition = squadComposition[difficulty];
        const statRange = knightStatRanges[difficulty];

        if (composition) {
            for (const unitType in composition) {
                for (let i = 0; i < composition[unitType]; i++) {
                    const totalStatPoints = randomInt(statRange[0], statRange[1]);
                    let knight; // <--- 宣告變數
                    if (roll(50)) {
                        knight = new FemaleKnightOrderUnit(unitType, totalStatPoints);
                    } else {
                        knight = new KnightOrderUnit(unitType, totalStatPoints);
                    }
                    this.equipEnemy(knight, difficulty); // <--- 在此處加入呼叫
                    knightSquad.push(knight);
                }
            }
        }
        
        // 標記這是一場無法逃脫的增援戰
        this.combat.isReinforcementBattle = true; 
        
        // 開始戰鬥，設定敵人先攻
        this.startCombat(knightSquad, true); 
    },

    sneakKidnap(target, group) {
        const playerAgility = this.player.getTotalStat('agility', this.isStarving);
        const enemyAgility = target.stats.agility;
        const sneakChance = 50 + (playerAgility - enemyAgility) * 1.5 - (this.player.party.length + 1 - 1) * 2;
        const successChance = sneakChance - 15;

        if (roll(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行擄走 ${target.name} 成功！(-3 分鐘)`, 'success');
            this.addCaptiveToCarry(target);
            this.gainResourcesFromEnemy(target);
            this.currentRaid.currentZone.enemies = this.currentRaid.currentZone.enemies.map(g => g.filter(e => e.id !== target.id)).filter(g => g.length > 0);
            this.checkRaidTime();
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.currentRaid.failedSneakTargets.add(target.id);
            this.logMessage('raid', `潛行擄走 ${target.name} 失敗，你被發現了！(-6 分鐘)`, 'enemy');
            this.startCombat(group, true);
            this.checkRaidTime();
        }
    },

    startCombat(enemyGroup, enemyFirstStrike = false) {
        this.combat.allies = [this.player, ...this.player.party].filter(u => u.isAlive());
        this.combat.enemies = enemyGroup.filter(u => u.isAlive());
        this.combat.currentEnemyGroup = enemyGroup;
        this.combat.turn = 1;
        this.combat.isProcessing = false;
        this.combat.playerActionTaken = false;
        
        this.screen = 'combat';
        this.logs.combat = [];
        this.logMessage('combat', `戰鬥開始！`, 'system');
        
        if(enemyFirstStrike) {
            this.logMessage('combat', '敵人發動了突襲！', 'enemy');
            this.executeTurn(true); 
        } else {
            this.logMessage('combat', '等待你的指令...', 'system');
        }
    },
    async executePlayerAction(action) {
        if (this.combat.isProcessing || this.combat.playerActionTaken || !this.player || !this.player.isAlive()) return;
        this.combat.playerActionTaken = true;
        
        let continueToEnemyTurn = true;

        if (action === 'attack') {
            const livingEnemies = this.combat.enemies.filter(t => t.isAlive());
            if (livingEnemies.length > 0) {
                const target = livingEnemies[randomInt(0, livingEnemies.length - 1)];
                await this.processAttack(this.player, target, false);
            }
        } else if (action === 'escape') {
            const result = await this.attemptSneakEscape();
            if (result === 'escaped') {
                continueToEnemyTurn = false;
            }
        }

        if (continueToEnemyTurn && this.combat.enemies.filter(e => e.isAlive()).length > 0) {
            this.executeTurn(false);
        } else if (!continueToEnemyTurn) {
            
        } else {
            this.endCombat(true);
        }
    },
    async executeTurn(isEnemyFirstStrike = false) {
        if (this.combat.isProcessing) return;
        this.combat.isProcessing = true;

        if (this.combat.turn > 15) {
            const oldestTurnToKeep = this.combat.turn - 15;
            this.logs.combat = this.logs.combat.filter(entry => entry.turn >= oldestTurnToKeep);
        }
        
        // 【修改】將消耗時間的邏輯包裹在條件判斷中
        if (this.currentRaid) {
            // 如果是在掠奪中，才消耗時間並顯示倒數
            this.currentRaid.timeRemaining--;
            this.checkRaidTime();
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 (-1 分鐘) ---`, 'system');
        } else {
            // 如果不是在掠奪中 (例如部落防衛戰)，則不消耗時間
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 ---`, 'system');
        }

        const livingEnemies = this.combat.enemies.filter(e => e.isAlive());
        for (const unit of livingEnemies) {
            if (!unit.isAlive()) continue;
            await this.processAiAction(unit);
        }
        
        await new Promise(res => setTimeout(res, 200));

        if (!isEnemyFirstStrike) {
            const livingPartners = this.combat.allies.filter(p => p.id !== this.player.id && p.isAlive());
            for (const unit of livingPartners) {
                    if (!unit.isAlive()) continue;
                    await this.processAiAction(unit);
            }
        }
        this.tickStatusEffects();
        [...this.combat.allies, ...this.combat.enemies].forEach(u => u.tickCooldowns());

        const livingAlliesCount = this.combat.allies.filter(u => u.isAlive()).length;
        const livingEnemiesCount = this.combat.enemies.filter(u => u.isAlive()).length;

        if (livingAlliesCount === 0) {
            this.logMessage('combat', `戰鬥失敗... 你的隊伍被全滅了。`, 'enemy');
            this.endCombat(false);
        } else if (livingEnemiesCount === 0) {
            this.logMessage('combat', `戰鬥勝利！`, 'success');
            this.endCombat(true);
        } else { // Battle continues
        this.combat.turn++;
        this.combat.isProcessing = false;

        // 【核心修正】檢查哥布林王是否存活
        if (!this.player.isAlive()) {
            // 王陣亡，但夥伴還在，觸發自動戰鬥
            this.logMessage('combat', '哥布林王倒下了！夥伴們將繼續戰鬥！', 'system');
            // 延遲後自動進入下一回合
            setTimeout(() => this.executeTurn(false), 1500); // 延遲1.5秒讓玩家閱讀戰報
        } else {
            // 王還活著，恢復正常流程，等待玩家指令
            this.combat.playerActionTaken = false;
            this.logMessage('combat', '等待你的指令...', 'system');
        }
    }
    },
    async processAiAction(attacker) {
        const isAlly = this.combat.allies.some(a => a.id === attacker.id);
        const allies = isAlly ? this.combat.allies.filter(u => u.isAlive()) : this.combat.enemies.filter(u => u.isAlive());
        const enemies = isAlly ? this.combat.enemies.filter(u => u.isAlive()) : this.combat.allies.filter(u => u.isAlive());

        if (enemies.length === 0) return;

        let actionTaken = false;

        if (attacker.skills && attacker.skills.length > 0) {
            const skill = attacker.skills[0];
            if (skill.currentCooldown === 0) {
                if (skill.type === 'team_heal') {
                    const totalMaxHp = allies.reduce((sum, a) => sum + a.maxHp, 0);
                    const totalCurrentHp = allies.reduce((sum, a) => sum + a.currentHp, 0);
                    if ((totalCurrentHp / totalMaxHp) < skill.triggerHp) {
                        await this.executeSkill(skill, attacker, allies, enemies);
                        actionTaken = true;
                    }
                } else {
                    // 【新增檢查】檢查施法者身上是否已經有同類型的技能效果
                    const isEffectActive = attacker.statusEffects.some(e => e.type === skill.type);

                    // 只有當效果未生效時，才施放技能
                    if (!isEffectActive) {
                        await this.executeSkill(skill, attacker, allies, enemies);
                        actionTaken = true;
                    }
                    // 如果 isEffectActive 為 true，則 actionTaken 保持 false，AI會接著執行普通攻擊
                }
            }
        }
        
        const chargingEffect = attacker.statusEffects.find(e => e.type === 'charge_nuke');
        if (chargingEffect) {
            if (chargingEffect.chargeTurns <= 0) {
                this.logMessage('combat', `[${attacker.name}] 的 [破滅法陣] 詠唱完畢！`, 'skill');
                const damage = Math.floor(attacker.getTotalStat('intelligence') * chargingEffect.multiplier);
                for (const target of enemies) {
                    if (target.isAlive()) {
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        this.logMessage('combat', `法陣衝擊了 ${target.name}，造成 ${damage} 點無法閃避的傷害。`, 'enemy');
                        if (!target.isAlive()) this.logMessage('combat', `${target.name} 被擊敗了！`, 'system');
                    }
                }
                attacker.statusEffects = attacker.statusEffects.filter(e => e.type !== 'charge_nuke');
            } else {
                this.logMessage('combat', `${attacker.name} 正在詠唱... (剩餘 ${chargingEffect.chargeTurns} 回合)`, 'info');
            }
            actionTaken = true;
        }

        if (!actionTaken) {
            const target = enemies[randomInt(0, enemies.length - 1)];
            await this.processAttack(attacker, target, false);
        }
        
        await new Promise(res => setTimeout(res, 300));
    },
    async processAttack(attacker, target, isMultiHit = false) {
        const isAllyAttacking = this.combat.allies.some(a => a.id === attacker.id);
        const enemyTeam = isAllyAttacking ? this.combat.enemies : this.combat.allies;
        let currentTarget = target;

        // --- 嘲諷檢查 ---
        const taunter = enemyTeam.find(e => e.statusEffects.some(s => s.type === 'taunt'));
        if (taunter && taunter.id !== currentTarget.id && taunter.isAlive()) {
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${taunter.name} 吸引了！`, 'info');
            currentTarget = taunter;
        }

        // --- 【核心修改】格擋判定 ---
        const targetHasShield = currentTarget.equipment?.offHand?.baseName === '盾';
        if (targetHasShield && currentTarget.isAlive()) {
            const luckConversionRate = 0.1; // 幸運轉換率 (10%)
            const blockEfficiency = 0.5; // 格擋效率 (減傷50%)
            
            const baseBlockChance = currentTarget.equipment.offHand.stats.blockChance || 0;
            const luckValue = currentTarget.getTotalStat('luck', this.isStarving);
            const finalBlockChance = baseBlockChance + (luckValue / 100) * (luckConversionRate * 100);

            if (roll(finalBlockChance)) {
                let originalDamage = attacker.calculateDamage(this.isStarving);
                let reducedDamage = Math.floor(originalDamage * (1 - blockEfficiency));
                
                this.logMessage('combat', `${currentTarget.name} 成功格擋了攻擊！`, 'skill');
                this.logMessage('combat', `${attacker.name} 對 ${currentTarget.name} 造成了 ${reducedDamage} 點被格擋的傷害。`, isAllyAttacking ? 'player' : 'enemy');

                currentTarget.currentHp = Math.max(0, currentTarget.currentHp - reducedDamage);
                if (!currentTarget.isAlive()) {
                    this.logMessage('combat', `${currentTarget.name} 被擊敗了！`, 'system');
                }
                // 格擋成功後，攻擊流程直接結束
                return; 
            }
        }

        // --- 如果格擋未發生，則進行正常的命中與傷害計算 ---
        const isChargingNuke = currentTarget.statusEffects.some(e => e.type === 'charge_nuke');
        const hitChance = 75 + (attacker.getTotalStat('agility', this.isStarving) - currentTarget.getTotalStat('agility', this.isStarving)) * 2;
        const logType = isAllyAttacking ? 'player' : 'enemy';

        if (isChargingNuke || roll(hitChance)) {
            if (isChargingNuke) {
                this.logMessage('combat', `${currentTarget.name} 正在詠唱，無法閃避！`, 'info');
            }

            let damage = attacker.calculateDamage(this.isStarving);
            const critChance = 5 + 10 * Math.log10(attacker.getTotalStat('luck', this.isStarving) || 1);
            let isCrit = roll(critChance);
            let critMultiplier = 1.5;
            const devastatingAffix = Object.values(attacker.equipment || {}).flatMap(i => i ? i.affixes : []).find(a => a.key === 'devastating');
            
            if (isCrit && devastatingAffix) {
                critMultiplier = devastatingAffix.procInfo.value;
                this.logMessage('combat', `${attacker.name} 的 [毀滅] 詞綴觸發了！爆擊更為致命！`, 'skill');
            }

            if(isCrit) {
                damage = Math.floor(damage * critMultiplier); 
                this.logMessage('combat', `幸運觸發！ ${attacker.name} 攻擊 ${currentTarget.name}，造成 ${damage} 點爆擊傷害。`, 'crit');
            } else {
                this.logMessage('combat', `${attacker.name} 攻擊 ${currentTarget.name}，造成 ${damage} 點傷害。`, logType);
            }
            
            // 後續的反傷、吸血等詞綴邏輯...
            currentTarget.currentHp = Math.max(0, currentTarget.currentHp - damage);

            if (!currentTarget.isAlive()) {
                this.logMessage('combat', `${currentTarget.name} 被擊敗了！`, 'system');
                if (!this.combat.allies.some(a => a.id === currentTarget.id)) {
                    this.gainResourcesFromEnemy(currentTarget);
                    this.handleLootDrop(currentTarget);
                } else if (currentTarget.id !== this.player.id) {
                    this.handlePartnerDeath(currentTarget.id);
                }
            }
        } else {
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${currentTarget.name} 閃過了！`, logType === 'player' ? 'enemy' : 'player');
        }
        
        // 後續的連擊等詞綴邏輯...
        if (attacker.isAlive() && currentTarget.isAlive() && !isMultiHit) {
            if (attacker.equipment) {
                const multiHitAffix = Object.values(attacker.equipment).flatMap(i => i ? i.affixes : []).find(a => a.key === 'multi_hit');
                if (multiHitAffix && roll(this.calculateProcChance(multiHitAffix.procInfo.baseRate))) {
                    this.logMessage('combat', `${attacker.name} 的 [連擊] 詞綴觸發，發動了額外攻擊！`, 'skill');
                    await new Promise(res => setTimeout(res, 400));
                    await this.processAttack(attacker, currentTarget, true);
                }
            }
        }
    },
    gainResourcesFromEnemy(enemy) {
        // 【新增】如果不是在掠奪中 (例如部落防衛戰)，則不掉落資源，直接返回。
        if (!this.currentRaid) {
            return;
        }

        const dropConfig = {
            easy:   { res: [5, 10],  guard: [10, 15] },
            normal: { res: [10, 20], guard: [20, 30] },
            hard:   { res: [20, 40], guard: [40, 60] },
            hell:   { res: [40, 80], guard: [80, 120] },
        };
        const difficulty = this.currentRaid.difficulty;
        let foodDrop = 0, woodDrop = 0, stoneDrop = 0;

        if (enemy.profession.includes('居民')) {
            foodDrop = randomInt(dropConfig[difficulty].res[0], dropConfig[difficulty].res[1]);
            woodDrop = randomInt(dropConfig[difficulty].res[0], dropConfig[difficulty].res[1]);
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodDrop);
            this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodDrop);
            this.logMessage('raid', `你獲得了 食物x${foodDrop}, 木材x${woodDrop}。`, 'success');
        } else if (enemy.profession.includes('守軍')) {
            foodDrop = randomInt(dropConfig[difficulty].guard[0], dropConfig[difficulty].guard[1]);
            stoneDrop = randomInt(dropConfig[difficulty].guard[0], dropConfig[difficulty].guard[1]);
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodDrop);
            this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneDrop);
            this.logMessage('raid', `你獲得了 食物x${foodDrop}, 礦石x${stoneDrop}。`, 'success');
        }
    },
    handleLootDrop(enemy) {
        const baseDropRates = { '居民': 10, '女性居民': 10, '城市守軍': 30 };
        const isKnight = Object.keys(KNIGHT_ORDER_UNITS).includes(enemy.profession);
        
        const baseDropRate = isKnight ? 50 : (baseDropRates[enemy.profession] || 0);
        if (baseDropRate === 0) return;

        const finalDropRate = baseDropRate * (1 + (this.player.getTotalStat('luck') / 100) * 0.5);

        if (roll(finalDropRate)) {
            if (this.player.inventory.length >= this.backpackCapacity) {
                this.logMessage('raid', `你的背包已滿，無法拾取新的裝備！`, 'enemy');
                return;
            }

            // 【核心修正】智能判斷難度來源
            let encounterDifficulty = 'easy'; // 設定一個安全的預設值
            if (this.currentRaid) {
                // 如果是掠奪戰，使用掠奪的難度
                encounterDifficulty = this.currentRaid.difficulty;
            } else if (enemy.originDifficulty) {
                // 如果是非掠奪戰（如復仇小隊），使用敵人自身的難度屬性
                encounterDifficulty = enemy.originDifficulty;
            }

            const materialTiers = {
                easy: { metal: [1, 3], wood: [1, 3] },
                normal: { metal: [2, 4], wood: [2, 4] },
                hard: { metal: [3, 5], wood: [3, 5] },
                hell: { metal: [4, 6], wood: [4, 6] },
            };
            const qualityTiers = {
                '居民': ['worn', 'common'],
                '女性居民': ['worn', 'common'],
                '城市守軍': ['uncommon', 'rare'],
                'knight': ['epic', 'legendary']
            };

            const possibleTiers = materialTiers[encounterDifficulty]; // 使用修正後的難度變數
            
            const isMetal = roll(50);
            const tierRange = isMetal ? possibleTiers.metal : possibleTiers.wood;
            const tier = randomInt(tierRange[0], tierRange[1]);
            const materialType = isMetal ? 'metal' : 'wood';
            const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType);
            
            if (!materialKey) return;

            const qualitySource = isKnight ? 'knight' : enemy.profession;
            const possibleQualities = qualityTiers[qualitySource] || ['worn'];
            const qualityKey = possibleQualities[randomInt(0, possibleQualities.length - 1)];

            const randomItemType = this.craftableTypes[randomInt(0, this.craftableTypes.length - 1)];
            const newItem = this.createEquipment(materialKey, qualityKey, randomItemType.baseName);
            
            this.player.inventory.push(newItem);
            
            if (this.tutorial.active && !this.tutorial.finishedEquipping) {
                this.triggerTutorial('firstLoot');
            }
            this.logMessage('raid', `你從 ${enemy.name} 身上獲得了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');
        }
    },
    // 【最終版本】為敵人穿戴裝備的智慧助手函式
    equipEnemy(enemy, difficulty) {
        if (!enemy || !enemy.equipment) return;

        const isKnight = Object.keys(KNIGHT_ORDER_UNITS).includes(enemy.profession);

        // ------------------------------------------------------------------
        // I. 騎士團 (Knight Order) 的專屬裝備邏輯
        // ------------------------------------------------------------------
        if (isKnight) {
            const qualityKey = 'epic'; // 騎士團固定穿史詩品質

            // 輔助函式：根據難度和可選的材質類型，獲取一個隨機材質
            const getRandomMaterialKey = (type = null) => {
                const materialTiers = {
                    easy:   { metal: [2, 3], wood: [2, 3] }, // 騎士團最低也從Tier 2開始
                    normal: { metal: [3, 4], wood: [3, 4] },
                    hard:   { metal: [4, 5], wood: [4, 5] },
                    hell:   { metal: [5, 6], wood: [5, 6] },
                };
                const possibleTiers = materialTiers[difficulty] || materialTiers['easy'];
                
                const materialType = type || (roll(50) ? 'metal' : 'wood');
                const tierRange = possibleTiers[materialType];
                const tier = randomInt(tierRange[0], tierRange[1]);
                
                return Object.keys(EQUIPMENT_MATERIALS).find(key => 
                    EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType
                );
            };

            // 輔助函式：建立一件指定裝備
            const createAndEquip = (slot, baseName, materialType = null) => {
                const materialKey = getRandomMaterialKey(materialType);
                if (!materialKey) return;
                const item = this.createEquipment(materialKey, qualityKey, baseName, null, true);
                enemy.equipment[slot] = item;
            };

            // 1. 所有騎士團成員必穿身體盔甲
            createAndEquip('chest', '鎧甲', enemy.profession === '盾兵' ? 'wood' : null);

            // 2. 根據職業分配武器和副手
            switch (enemy.profession) {
                case '士兵':
                    createAndEquip('mainHand', '劍');
                    if (roll(50)) { // 50%機率雙持
                        createAndEquip('offHand', '劍');
                    } else { // 50%機率劍盾
                        createAndEquip('offHand', '盾');
                    }
                    break;
                case '盾兵':
                    // 盾兵必拿木盾，身體盔甲在上面已經指定為木材質
                    createAndEquip('offHand', '盾', 'wood');
                    break;
                case '槍兵':
                    createAndEquip('mainHand', '長槍');
                    if (roll(50)) { // 50%機率持盾
                        createAndEquip('offHand', '盾');
                    }
                    break;
                case '法師':
                    createAndEquip('mainHand', '法杖');
                    break;
                case '弓兵': // 遊戲內代碼為'弓兵'
                    createAndEquip('mainHand', '弓');
                    break;
                case '祭司':
                    createAndEquip('mainHand', '法杖');
                    createAndEquip('offHand', '盾', 'wood'); // 副手必為木盾
                    break;
                case '騎士':
                    if (roll(50)) { // 50%機率劍盾
                        createAndEquip('mainHand', '劍');
                    } else { // 50%機率槍盾
                        createAndEquip('mainHand', '長槍');
                    }
                    createAndEquip('offHand', '盾'); // 副手必為盾
                    break;
                default: // 其他未定義的騎士團職業，給予預設裝備
                    createAndEquip('mainHand', '劍');
                    createAndEquip('offHand', '盾');
                    break;
            }

        // ------------------------------------------------------------------
        // II. 守軍與居民 (Guard & Resident) 的裝備邏輯
        // ------------------------------------------------------------------
        } else {
            let numPieces = 0;
            let qualityKey = 'worn';
            // (此處邏輯與上一版相同)
            if (enemy.profession === '城市守軍') {
                numPieces = randomInt(1, 2);
                qualityKey = 'uncommon';
            } else if (enemy.profession.includes('居民')) {
                if (roll(50)) {
                    numPieces = 1;
                    qualityKey = 'worn';
                } else {
                    return;
                }
            } else {
                return;
            }
            // (後續的通用裝備生成邏輯也與上一版相同)
            const materialTiers = {
                easy: { metal: [1, 3], wood: [1, 3] },
                normal: { metal: [2, 4], wood: [2, 4] },
                hard: { metal: [3, 5], wood: [3, 5] },
                hell: { metal: [4, 6], wood: [4, 6] },
            };
            const possibleTiers = materialTiers[difficulty] || materialTiers['easy'];
            
            let possibleSlots = ['mainHand', 'chest', 'offHand'];
            for (let i = 0; i < numPieces; i++) {
                if (possibleSlots.length === 0) break;
                const slotIndex = randomInt(0, possibleSlots.length - 1);
                const slot = possibleSlots.splice(slotIndex, 1)[0];
                let baseItem = this.craftableTypes.find(t => t.slot === slot) || this.craftableTypes[0];
                if (slot === 'offHand') baseItem = this.craftableTypes.find(t => t.baseName === '盾');
                if (!baseItem) continue;

                const isMetal = roll(50);
                const tierRange = isMetal ? possibleTiers.metal : possibleTiers.wood;
                const tier = randomInt(tierRange[0], tierRange[1]);
                const materialType = isMetal ? 'metal' : 'wood';
                const materialKey = Object.keys(EQUIPMENT_MATERIALS).find(key => 
                    EQUIPMENT_MATERIALS[key].tier === tier && EQUIPMENT_MATERIALS[key].type === materialType
                );
                if (!materialKey) continue;

                const newItem = this.createEquipment(materialKey, qualityKey, baseItem.baseName, null, true);
                enemy.equipment[slot] = newItem;
            }
        }

        // ------------------------------------------------------------------
        // III. 最後更新敵人狀態 (通用)
        // ------------------------------------------------------------------
        if (enemy.updateHp) {
            enemy.updateHp(this.isStarving);
        } else {
            enemy.maxHp = enemy.calculateMaxHp(this.isStarving);
            enemy.currentHp = enemy.maxHp;
        }
    },
    createEquipment(materialKey, qualityKey, baseName, specialAffix = null, forceNoAffix = false) {
        const material = EQUIPMENT_MATERIALS[materialKey];
        const quality = EQUIPMENT_QUALITIES[qualityKey];
        const baseItem = this.craftableTypes.find(t => t.baseName === baseName);
        
        const newItem = new Equipment(baseItem.baseName, baseItem.type, baseItem.slot, material, quality, specialAffix);
        
        const baseStats = BASE_EQUIPMENT_STATS[material.type][baseItem.baseName][material.tier];
        
        // 1. 計算基礎屬性
        for (const stat in baseStats) {
            newItem.stats[stat] = Math.floor(baseStats[stat] * quality.multiplier);
        }                    
        // 2. 如果不是特殊詛咒裝備，就生成標準詞綴
        if (!specialAffix && !forceNoAffix) {
            const affixCountRange = quality.affixes;
            const affixCount = randomInt(affixCountRange[0], affixCountRange[1]);
            
            let availableAffixes = Object.keys(STANDARD_AFFIXES);
            
            for (let i = 0; i < affixCount && availableAffixes.length > 0; i++) {
                const randomAffixKey = availableAffixes[randomInt(0, availableAffixes.length - 1)];
                const selectedAffix = { ...STANDARD_AFFIXES[randomAffixKey], key: randomAffixKey }; // 複製一份並加上key
                
                newItem.affixes.push(selectedAffix);
                
                // 移除已選中的和所有衝突的詞綴，防止再次選中
                availableAffixes = availableAffixes.filter(key => {
                    if (key === randomAffixKey) return false;
                    if (selectedAffix.conflicts && selectedAffix.conflicts.includes(key)) return false;
                    const otherAffix = STANDARD_AFFIXES[key];
                    if (otherAffix.conflicts && otherAffix.conflicts.includes(randomAffixKey)) return false;
                    return true;
                });
            }
        }                  
        // 3. 更新最終名稱
        newItem.name = newItem.generateName();
        
        return newItem;
    },
    handlePartnerDeath(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (partner) {
            this.logMessage('combat', `你的夥伴 ${partner.name} 在戰鬥中陣亡了！他將永遠離開你...`, 'enemy');
            this.partners = this.partners.filter(p => p.id !== partnerId);
            this.player.party = this.player.party.filter(p => p.id !== partnerId);
            this.player.updateHp(this.isStarving);
        }
    },
    async attemptSneakEscape() {
        return new Promise(resolve => {
            const playerAgility = this.player.getTotalStat('agility', this.isStarving);
            const enemyAvgAgility = this.combat.enemies.reduce((sum, e) => sum + e.stats.agility, 0) / this.combat.enemies.length;
            const successChance = 50 + (playerAgility - enemyAvgAgility) * 1.5 - (this.combat.allies.length - this.combat.enemies.length) * 2;
        
            this.logMessage('combat', '你嘗試潛行脫離戰鬥...', 'player');

            setTimeout(() => {
                if (roll(successChance)) {
                    this.logMessage('combat', '脫離成功！', 'success');
                    this.finishCombatCleanup();
                    resolve('escaped');
                } else {
                    this.logMessage('combat', '脫離失敗！', 'enemy');
                    resolve('failed');
                }
            }, 500);
        });
    },

    endCombat(victory) {
        // 【新增此區塊】在所有邏輯開始前，檢查時間耗盡標記
        if (this.currentRaid && this.raidTimeExpired) {
            this.raidTimeExpired = false; // 重置標記
            if (victory) {
                // 如果玩家贏了當前戰鬥，立即觸發增援戰
                this.triggerReinforcementBattle();
            } else {
                // 如果玩家輸了當前戰鬥，直接結束掠奪
                this.prepareToEndRaid(true);
            }
            return; // 中斷後續的 endCombat 程式碼，防止邏輯衝突
        }
        // --- 新增：處理非掠奪戰鬥（如復仇小隊）---
        if (!this.currentRaid) {
            if (victory) {
                this.logMessage('tribe', '你成功擊退了來襲的敵人！', 'success');

                // 處理俘虜
                const defeatedFemales = this.combat.enemies.filter(e => e instanceof FemaleHuman && !e.isAlive());
                if (defeatedFemales.length > 0) {
                    if ((this.dungeonCaptives.length + defeatedFemales.length) > this.captiveCapacity) {
                        this.logMessage('tribe', '地牢空間不足，你需要決定俘虜的去留...', 'warning');
                        this.pendingDecisions.push({
                            type: 'dungeon',
                            list: [...this.dungeonCaptives, ...defeatedFemales],
                            limit: this.captiveCapacity,
                            context: { postBattleBirths: this.postBattleBirths }
                        });
                    } else {
                        this.captives.push(...defeatedFemales);
                        this.logMessage('tribe', `你俘虜了 ${defeatedFemales.length} 名戰敗的敵人。`, 'info');
                    }
                }

                // 恢復狀態
                this.player.currentHp = this.player.maxHp;
                this.partners.forEach(p => p.currentHp = p.maxHp);
                
                // 處理戰鬥前暫停的出生事件
                (this.postBattleBirths || []).forEach(mother => this.giveBirth(mother));
                this.postBattleBirths = [];

                // 清理戰鬥狀態並返回部落畫面
                this.finishCombatCleanup(true);

                // **核心修正**：呼叫新函式，繼續當天的剩餘流程
                this.continueNextDay();
            } else {
                // 戰敗邏輯不變，直接觸發重生
                this.prepareToEndRaid(true);
            }
            return; // 結束函式，不再執行後續的掠奪邏輯
        }

        // --- 原有的掠奪戰鬥處理邏輯（維持不變）---
        if (victory) {
            // --- 這一段處理戰利品和訊息的邏輯不變 ---
            const defeatedFemales = this.combat.enemies.filter(e => e instanceof FemaleHuman && !e.isAlive());
            if (defeatedFemales.length > 0) {
                this.currentRaid.carriedCaptives.push(...defeatedFemales);
            }
            if (this.player && !this.player.isAlive()) {
                this.logMessage('tribe', '夥伴們獲得了勝利！牠們將倒下的哥布林王帶回了部落。', 'success');
            }

            // --- 核心修改從這裡開始 ---
            if (this.combat.isReinforcementBattle) {
                // 【新增判斷式】檢查增援戰是如何觸發的
                if (this.isRetreatingWhenTimeExpired) {
                    // 如果是在「脫離時」觸發的，維持舊邏輯，返回部落
                    this.logMessage('tribe', '你擊敗了前來阻截的騎士團，成功帶著戰利品返回部落！', 'success');
                    this.prepareToEndRaid(false);
                } else {
                    this.currentRaid.reinforcementsDefeated = true;
                    // 如果是在「城鎮中」觸發的，執行新邏輯
                    this.currentRaid.timeRemaining = Infinity; // 將時間設為無限，停止倒數
                    this.logMessage('raid', '你擊敗了騎士團的增援部隊！時間壓力消失了，你可以繼續探索這座城鎮。', 'success');
                    // 清理戰鬥狀態，並返回掠奪地圖，而不是部落
                    this.finishCombatCleanup(); 
                }
                // 無論結果如何，都要將旗標重置，以免影響下一次判斷
                this.isRetreatingWhenTimeExpired = false;
                
            } else {
                // 普通戰鬥的勝利邏輯不變
                if (this.currentRaid.carriedCaptives.length > this.carryCapacity) {
                    this.openCaptiveManagementModal('raid', this.currentRaid.carriedCaptives, this.carryCapacity);
                } else {
                    this.finishCombatCleanup();
                }
            }
        } else { 
            // 戰敗邏輯不變
            this.prepareToEndRaid(true);
        }
    },

    tickStatusEffects() {
        const allUnitsForRegen = [...this.combat.allies, ...this.combat.enemies];
        allUnitsForRegen.forEach(unit => {
            if (!unit.isAlive() || !unit.equipment) return;
            
            const regeneratingAffix = Object.values(unit.equipment).flatMap(i => i ? i.affixes : []).find(a => a.key === 'regenerating');
            if (regeneratingAffix) {
                const healAmount = Math.floor(unit.maxHp * regeneratingAffix.procInfo.value);
                if (healAmount > 0) {
                    unit.currentHp = Math.min(unit.maxHp, unit.currentHp + healAmount);
                    this.logMessage('combat', `${unit.name} 的 [再生] 詞綴發動，恢復了 ${healAmount} 點生命。`, 'skill');
                }
            }
        });
        const allUnits = [...this.combat.allies, ...this.combat.enemies];
        allUnits.forEach(unit => {
            if (!unit.statusEffects) unit.statusEffects = [];
            unit.statusEffects.forEach(effect => {
                if(effect.duration > 0) effect.duration--;
                if(effect.type === 'charge_nuke' && effect.chargeTurns > 0) effect.chargeTurns--;
            });
            unit.statusEffects = unit.statusEffects.filter(effect => effect.duration > 0);
        });
    },
    async executeSkill(skill, caster, allies, enemies) {
        this.logMessage('combat', `${caster.name} 施放了 <span class="text-pink-400">[${skill.name}]</span>！`, 'skill');
        if(caster.skills[0]) caster.skills[0].currentCooldown = skill.cd;

        switch (skill.type) {
            case 'aoe_str':
            case 'aoe_agi':
                const damageStat = skill.type === 'aoe_str' ? 'strength' : 'agility';
                const damage = Math.floor(caster.getTotalStat(damageStat) * skill.multiplier);
                for (const target of enemies) {
                    if (target.isAlive()) {
                        target.currentHp = Math.max(0, target.currentHp - damage);
                        this.logMessage('combat', `[${skill.name}] 對 ${target.name} 造成了 ${damage} 點傷害。`, 'enemy');
                        if (!target.isAlive()) this.logMessage('combat', `${target.name} 被擊敗了！`, 'system');
                    }
                }
                break;
            case 'taunt':
                caster.statusEffects.push({ type: 'taunt', duration: skill.duration + 1 });
                this.logMessage('combat', `${caster.name} 吸引了所有人的注意！`, 'info');
                break;
            case 'reflect_buff':
                const existingBuff = allies.some(a => a.statusEffects.some(e => e.type === 'reflect_buff'));
                if (!existingBuff) {
                    allies.forEach(ally => ally.statusEffects.push({ type: 'reflect_buff', duration: skill.duration, damagePercent: skill.damagePercent }));
                    this.logMessage('combat', '騎士團啟用了槍陣，攻擊他們將會反噬自身！', 'info');
                }
                break;
            case 'king_nuke':
                const king = enemies.find(e => e.id === this.player.id);
                if (king && king.isAlive()) {
                    const kingDamage = caster.getTotalStat('strength') + caster.getTotalStat('agility');
                    king.currentHp = Math.max(0, king.currentHp - kingDamage);
                    this.logMessage('combat', `[騎士道] 無視了你的夥伴，對哥布林王造成了 ${kingDamage} 點巨大傷害！`, 'enemy');
                    if (!king.isAlive()) this.logMessage('combat', `${king.name} 被擊敗了！`, 'system');
                }
                break;
            case 'charge_nuke':
                caster.statusEffects.push({ type: 'charge_nuke', duration: skill.chargeTime + 1, chargeTurns: skill.chargeTime });
                this.logMessage('combat', `${caster.name} 開始詠唱咒文，空氣變得凝重起來...`, 'info');
                break;
            case 'team_heal':
                const healAmount = caster.getTotalStat('intelligence') * allies.length;
                allies.forEach(ally => {
                    if(ally.isAlive()) {
                        ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                    }
                });
                this.logMessage('combat', `聖光籠罩了騎士團，每名成員恢復了 ${healAmount} 點生命！`, 'success');
                break;
        }
        await new Promise(res => setTimeout(res, 500));
    },
    addCaptiveToCarry(newCaptives) {
        const captivesToAdd = Array.isArray(newCaptives) ? newCaptives : [newCaptives];
        const tempCarried = [...this.currentRaid.carriedCaptives, ...captivesToAdd];

        if (tempCarried.length > this.carryCapacity) {
            // 【修正】在呼叫時，將 this.carryCapacity 作為第三個參數傳遞進去
            this.openCaptiveManagementModal('raid', tempCarried, this.carryCapacity);
        } else {
            this.currentRaid.carriedCaptives = tempCarried;
            this.finishCombatCleanup();
        }
    },
    
    openCaptiveManagementModal(type, list, limit, dungeonLimit = -1, context = null) {
        const modal = this.modals.captiveManagement;
        modal.type = type;
        modal.list = list;
        modal.limit = limit;
        modal.dungeonLimit = dungeonLimit;
        modal.context = context; // 儲存額外資訊 (母親和新生兒)

        if (type === 'raid') {
            modal.title = '攜帶量已滿';
            modal.selectedIds = list.slice(0, limit).map(c => c.id);
        } else if (type === 'partner') {
            modal.title = '寢室空間不足';
            // 預設選取所有舊的夥伴，不選新生兒
            modal.selectedIds = list.filter(p => p.id !== context.newborn.id).map(p => p.id);
        } else { // dungeon
            modal.title = '地牢已滿';
            modal.selectedIds = list.filter(c => this.captives.some(existing => existing.id === c.id)).map(c => c.id);
        }
        // 自動調整預選，確保不超過地牢上限 (這段邏輯對夥伴管理無影響，但保留是安全的)
        if (dungeonLimit > -1) {
            let selectedDungeonCaptives = modal.list.filter(c => modal.selectedIds.includes(c.id) && !c.isPregnant && !c.isMother);
            while (selectedDungeonCaptives.length > dungeonLimit) {
                const captiveToRemove = selectedDungeonCaptives.pop();
                modal.selectedIds = modal.selectedIds.filter(id => id !== captiveToRemove.id);
            }
        }

        modal.isOpen = true;
    },
    // 請用這個【新版本】完整替換舊的 confirmCaptiveSelection 函式
    confirmCaptiveSelection() {
        const modal = this.modals.captiveManagement;
        const selectedSet = new Set(modal.selectedIds);
        
        if (modal.type === 'raid') {
            // 這是舊的邏輯：在掠奪地圖上，攜帶量滿了
            this.currentRaid.carriedCaptives = modal.list.filter(c => selectedSet.has(c.id));
            this.logMessage('raid', `你選擇保留 ${this.currentRaid.carriedCaptives.length} 名俘虜，拋棄了其餘的。`, 'info');
            this.finishCombatCleanup();
        } 
        else if (modal.type === 'raid_return') {
            // 【新增】這是新的邏輯：從掠奪返回部落，地牢滿了
            const keptDungeonCaptives = modal.list.filter(c => selectedSet.has(c.id));
            
            // 將保留下來的俘虜與產房裡的孕母合併成最終名單
            this.captives = [...this.mothers, ...keptDungeonCaptives];
            
            this.logMessage('tribe', `你整理了地牢，最終留下了 ${keptDungeonCaptives.length} 名俘虜。`, 'success');
            this.finalizeRaidReturn(); // 執行返回部落的最終流程
        }
        else { 
            // 這是舊的邏輯：從掠奪返回部落，總容量滿了 (現在較少觸發)
            this.captives = modal.list.filter(c => selectedSet.has(c.id));
            this.logMessage('tribe', `你帶回並整理了俘虜，最終部落擁有 ${this.captives.length} 名俘虜。`, 'player');
            this.finalizeRaidReturn();
        }
        
        this.modals.captiveManagement.isOpen = false;
    },
    openPartnerManagementModal(list, limit, context) {
        const modal = this.modals.partnerManagement;
        modal.list = list;
        modal.limit = limit;
        modal.context = context;
        modal.newbornId = context.newborn.id;
        // 預設選取所有舊的夥伴，不選新生兒
        modal.selectedIds = list.filter(p => p.id !== context.newborn.id).map(p => p.id);
        modal.isOpen = true;
    },

    confirmPartnerSelectionDecision() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        const { mother, newborn } = modal.context;

        // 【第一步】找出被放棄的夥伴
        const discardedPartners = modal.list.filter(p => !selectedSet.has(p.id));
        
        // 【第二步】收集所有被放棄夥伴身上的裝備
        const itemsToReturn = discardedPartners.flatMap(p => Object.values(p.equipment).filter(item => item !== null));

        // 【第三步】檢查空間並處理裝備 (與 releasePartner 函式邏輯相同)
        if (itemsToReturn.length > 0) {
            const availableSpace = (this.warehouseCapacity - this.warehouseInventory.length) + (this.backpackCapacity - this.player.inventory.length);
            
            if (itemsToReturn.length > availableSpace) {
                // 空間不足，打開處理視窗
                this.modals.itemManagement = {
                    isOpen: true,
                    title: `處理被放棄夥伴的裝備`,
                    message: `為新生兒騰出空間前，需先處理被放棄夥伴身上的裝備。請先處理以下物品，直到剩餘數量小於等於 ${availableSpace}。`,
                    items: [...itemsToReturn],
                    capacity: availableSpace,
                    onConfirm: () => {
                        // 當玩家在物品管理視窗處理完畢後，再執行最終的夥伴確認
                        this.finalizePartnerSelection();
                    }
                };
                // 暫時關閉夥伴選擇視窗，讓位給物品管理視窗
                modal.isOpen = false;
                return; // 中斷函式，等待玩家處理裝備
            } else {
                // 空間足夠，自動轉移
                itemsToReturn.forEach(item => {
                    if (this.warehouseInventory.length < this.warehouseCapacity) {
                        this.warehouseInventory.push(item);
                    } else {
                        this.player.inventory.push(item);
                    }
                });
                this.logMessage('tribe', `已將被放棄夥伴的 ${itemsToReturn.length} 件裝備自動移至倉庫/背包。`, 'info');
            }
        }

        // 如果不需要處理裝備或已處理完畢，直接執行最終確認
        this.finalizePartnerSelection();
    },
    // 【新增】用於新生兒決策的最終執行函式
    finalizePartnerSelection() {
        const modal = this.modals.partnerManagement;
        const selectedSet = new Set(modal.selectedIds);
        const { mother, newborn } = modal.context;

        const keptPartners = modal.list.filter(p => selectedSet.has(p.id));
        const wasNewbornKept = keptPartners.some(p => p.id === newborn.id);                  
        
        // 更新部落的夥伴總列表
        this.partners = keptPartners;
        
        if (wasNewbornKept) {
            this.player.skillPoints++;
            this.logMessage('tribe', `你為 ${newborn.name} 在寢室中騰出了空間！你獲得了 1 點技能點。`, 'success');
            if (this.tutorial.active && !this.tutorial.finishedPartyMgmt) {
                this.triggerTutorial('firstBirth');
            }
        } else {
            this.logMessage('tribe', `你決定放棄 ${mother.name} 的孩子，為更強的夥伴保留了位置。`, 'info');
        }                    
        
        mother.isPregnant = false;
        mother.pregnancyTimer = 0;
        mother.isMother = true;
        this.logMessage('tribe', `${mother.name} 現在開始在產房為部落貢獻奶水。`, 'info');

        modal.isOpen = false;
        
        // 【核心修正】採用更簡潔、更穩定的方式來更新出擊隊伍
        const keptPartnerIds = new Set(this.partners.map(p => p.id));
        this.player.party = this.player.party.filter(p => keptPartnerIds.has(p.id));
        this.player.updateHp(this.isStarving);
    },
    // 1. 在函式定義中，加入一個帶有「預設值」的參數
    finishCombatCleanup(returnToTribe = false) {
        if (this.currentRaid) {
            this.currentRaid.currentZone.buildings.forEach(b => {
                b.occupants = b.occupants.filter(o => o.isAlive());
                if (b.scouted && b.occupants.length === 0) {
                    b.postScoutText = b.looted ? ' (空)' : ' (可搜刮)';
                }
            });
            
            const newEnemiesList = [];
            for (const group of this.currentRaid.currentZone.enemies) {
                const livingMembers = group.filter(member => member.isAlive());
                if (livingMembers.length > 0) {
                    newEnemiesList.push(livingMembers);
                }
            }
            this.currentRaid.currentZone.enemies = newEnemiesList;
        }
        
        this.combat.allies = [];
        this.combat.enemies = [];
        this.combat.turn = 0;
        this.combat.log = [];
        this.combat.isProcessing = false;
        this.combat.currentEnemyGroup = [];
        this.combat.playerActionTaken = false;
        this.combat.isReinforcementBattle = false; // 統一在此處重置

        this.screen = returnToTribe ? 'tribe' : 'raid';
    },
    showCustomAlert(message, onConfirmCallback = null) {
        this.modals.customAlert.message = message;
        this.modals.customAlert.onConfirm = onConfirmCallback;
        this.modals.customAlert.isOpen = true;
    },
    confirmCustomAlert() {
        this.modals.customAlert.isOpen = false;
        if (typeof this.modals.customAlert.onConfirm === 'function') {
            setTimeout(() => {
                this.modals.customAlert.onConfirm();
                this.modals.customAlert.onConfirm = null;
            }, 100);
        }
    },
    processNextDecision() {
        if (this.pendingDecisions.length === 0) return;

        const decision = this.pendingDecisions.shift();

        if (decision.type === 'partner') {
            // 如果是夥伴寢室已滿的決策，呼叫新的夥伴管理視窗
            this.openPartnerManagementModal(decision.list, decision.limit, decision.context);
        } else {
            // 否則，維持舊的邏輯，呼叫統一俘虜管理視窗
            this.openCaptiveManagementModal(
                decision.type,
                decision.list,
                decision.limit,
                decision.dungeonLimit,
                decision.context
            );
        }
    },
    logMessage(panelKey, message, type = 'system') {
        const logArray = this.logs[panelKey];
        if (logArray) {
            const logEntry = { id: crypto.randomUUID(), message, type };
            
            if (panelKey === 'combat') {
                logEntry.turn = this.combat.turn;
            }
            
            logArray.push(logEntry);
            
            if (logArray.length > 100) {
                logArray.shift();
            }
        }
    },

    importSaveData: '', // 新增一個屬性來儲存匯入的文字

    exportGame() {
        const saveData = localStorage.getItem('goblinKingSaveFile');
        if (!saveData) {
            this.showCustomAlert('沒有找到存檔，請先儲存遊戲。');
            return;
        }

        // 使用 Clipboard API 進行自動複製
        navigator.clipboard.writeText(saveData)
            .then(() => {
                this.showCustomAlert('遊戲存檔已複製到剪貼簿！請貼到安全的地方保存。');
            })
            .catch(err => {
                console.error('自動複製失敗:', err);
                // 如果自動複製失敗，回退到傳統的彈出視窗方式
                this.showCustomAlert('自動複製失敗，請手動複製以下文字並妥善保存：<br><br>' + saveData);
            });
    },

    // 匯入存檔方法
    importGame() {
        if (!this.importSaveData) {
            this.showCustomAlert('請先貼上有效的存檔代碼！');
            return;
        }

        try {
            // 嘗試解析玩家貼上的 JSON 字串
            const parsedData = JSON.parse(this.importSaveData);

            // 檢查存檔資料的有效性，確保它是遊戲的存檔格式
            if (parsedData && parsedData.player && parsedData.day) {
                // 將解析後的資料存回 Local Storage
                localStorage.setItem('goblinKingSaveFile', this.importSaveData);
                this.showCustomAlert('存檔匯入成功！遊戲將自動重新載入...');

                // 清空輸入框並重新載入遊戲，以應用新存檔
                this.importSaveData = '';
                setTimeout(() => {
                    window.location.reload(); // 重新載入頁面
                }, 1500);

            } else {
                // 如果解析失敗或資料格式不對，給予提示
                this.showCustomAlert('無效的存檔代碼，請檢查格式是否正確！');
            }
        } catch (e) {
            // 如果 JSON.parse 出錯，說明格式有問題
            console.error('匯入存檔失敗:', e);
            this.showCustomAlert('存檔代碼格式錯誤！請確認是完整的 JSON 字串。');
        }
    },

    saveGame() {
        const saveData = {
            player: this.player,
            warehouseInventory: this.warehouseInventory, // 儲存倉庫物品
            partners: this.partners,
            captives: this.captives,
            resources: this.resources,
            buildings: this.buildings,
            day: this.day,
            dispatch: this.dispatch, 
            narrativeMemory: this.narrativeMemory,
            tutorial: this.tutorial,
            breedingChargesLeft: this.breedingChargesLeft,
            merchant: this.merchant,// 儲存更完整的商人資訊
            tempStatIncreases: this.tempStatIncreases,//能力點
        };
        localStorage.setItem('goblinKingSaveFile', JSON.stringify(saveData));
        this.showCustomAlert('遊戲進度已儲存！');
        this.hasSaveFile = true;
    },
    // 【新增】存檔拯救函式，用於修復汙染的舊存檔
    // 【最終修正】存檔拯救函式，增加強制ID清洗功能
    salvageSaveData() {
        console.log("Running final save data salvage and ID sanitation...");
        
        const processedItems = new Set(); // 用於追蹤已處理過的物品，避免重複操作
        let itemsSanitized = 0;

        // 建立一個函式，遞迴地處理所有可能包含物品的地方
        const sanitizeAndRegenerateIds = (data) => {
            // 如果是物品物件 (有 id 和 baseName)
            if (data && data.id && data.baseName) {
                // 如果這個物品物件的參照我們已經處理過了，就跳過
                if (processedItems.has(data)) {
                    return data;
                }
                // 為該物品生成一個全新的 ID
                data.id = crypto.randomUUID();
                processedItems.add(data); // 標記為已處理
                itemsSanitized++;
                return data;
            }
            // 如果是陣列，就遞迴處理陣列中的每個元素
            if (Array.isArray(data)) {
                return data.map(item => sanitizeAndRegenerateIds(item));
            }
            // 如果是物件，就遞迴處理物件的每個屬性值
            if (typeof data === 'object' && data !== null) {
                Object.keys(data).forEach(key => {
                    data[key] = sanitizeAndRegenerateIds(data[key]);
                });
                return data;
            }
            // 如果是基本類型，直接返回
            return data;
        };

        // 從遊戲資料的根層級開始，對所有物品進行 ID 清洗
        this.warehouseInventory = sanitizeAndRegenerateIds(this.warehouseInventory);
        this.player = sanitizeAndRegenerateIds(this.player);
        this.partners = sanitizeAndRegenerateIds(this.partners);

        console.log(`ID Sanitation complete: Regenerated IDs for ${itemsSanitized} item instances.`);
        if (itemsSanitized > 0) {
            this.logMessage('tribe', `系統偵測到並修復了 ${itemsSanitized} 個存檔中的物品ID衝突。`, 'system');
        }
    },

    migrateSaveData() {
        // 【修正】使用 Map 來收集所有物品，以確保每個物品的唯一性
        const allKnownItems = new Map();

        // 1. 定義一個輔助函式來安全地添加物品到 Map 中
        const addItem = (item) => {
            // 確保 item 有效、有 id 且尚未被添加過
            if (item && item.id && !allKnownItems.has(item.id)) {
                allKnownItems.set(item.id, item);
            }
        };

        // 2. 遍歷所有可能的物品來源，並使用輔助函式添加
        this.player.inventory.forEach(addItem);
        this.warehouseInventory.forEach(addItem);
        Object.values(this.player.equipment).forEach(addItem);
        
        this.partners.forEach(p => {
            Object.values(p.equipment).forEach(addItem);
            // 確保 p.inventory 存在且為陣列
            if (Array.isArray(p.inventory)) {
                p.inventory.forEach(addItem);
            }
        });

        // 3. 從 Map 中取得獨一無二的物品列表，這將是乾淨無重複的
        const allItems = Array.from(allKnownItems.values());

        const migrateItem = (item) => {
            // (遷移邏輯維持不變)
            if (item && item.baseName === '盾' && typeof item.stats.blockChance === 'undefined') {
                const materialTier = item.material.tier;
                const materialType = item.material.type;
                
                const correctBlockChance = BASE_EQUIPMENT_STATS[materialType]['盾'][materialTier]?.blockChance;

                if (correctBlockChance) {
                    item.stats.blockChance = correctBlockChance;
                }
            }
        };

        allItems.forEach(migrateItem);
        console.log("Save data migration check complete.");
    },

    loadGame() {
            //【新增此區塊】在讀取任何資料前，先清空所有日誌
            this.logs = {
            tribe: [],
            raid: [],
            combat: []
        };

        const savedData = localStorage.getItem('goblinKingSaveFile');
        if (!savedData) {
            this.showCustomAlert('找不到存檔文件！');
            return;
        }

        try {
            this.isNewGame = false;
            const parsedData = JSON.parse(savedData);

            if (!parsedData.player) {
                throw new Error("存檔中缺少玩家資料！");
            }

            const rehydrateEquipment = (itemData) => {
                if (!itemData) return null;
                const newItem = new Equipment(itemData.baseName, itemData.type, itemData.slot, itemData.material, itemData.quality, itemData.specialAffix);
                Object.assign(newItem, itemData);
                return newItem;
            };

            const safelyAssign = (target, source) => {
                if (!source || typeof source !== 'object') return;
                for (const key in source) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        if (typeof target[key] !== 'function') {
                            if (key === 'equipment') {
                                target.equipment.mainHand = rehydrateEquipment(source.equipment.mainHand);
                                target.equipment.offHand = rehydrateEquipment(source.equipment.offHand);
                                target.equipment.chest = rehydrateEquipment(source.equipment.chest);
                            } else if (key === 'inventory') {
                                target.inventory = source.inventory.map(itemData => rehydrateEquipment(itemData));
                            } else {
                                target[key] = source[key];
                            }
                        }
                    }
                }
            };
            
            this.warehouseInventory = (parsedData.warehouseInventory || []).map(itemData => rehydrateEquipment(itemData));

            this.partners = (parsedData.partners || []).map(pData => {
                const partner = new Goblin(pData.name, pData.stats || {});
                safelyAssign(partner, pData);
                return partner;
            });

            // 【 Bug 修復：新增完整的俘虜還原邏輯 】
            this.captives = (parsedData.captives || []).map(cData => {
                let captive;
                // 判斷是否為騎士團成員，以使用正確的類別來還原
                if (Object.keys(KNIGHT_ORDER_UNITS).includes(cData.profession)) {
                    captive = new FemaleKnightOrderUnit(cData.profession, 0, cData.originDifficulty || 'easy');
                } else {
                    // 其他所有女性俘虜（居民、公主、魅魔等）都使用 FemaleHuman 類別
                    captive = new FemaleHuman(cData.name, cData.stats || {}, cData.profession, cData.visual, cData.originDifficulty || 'easy');
                }
                // 安全地將存檔中的所有屬性（isPregnant, pregnancyTimer, isMother...）複製到新建立的物件上
                safelyAssign(captive, cData);
                return captive;
            });


            const loadedPlayerInstance = new Player(parsedData.player.name, parsedData.player.stats || {});
            safelyAssign(loadedPlayerInstance, parsedData.player);
            this.player = loadedPlayerInstance;

            const partnersMap = new Map(this.partners.map(p => [p.id, p]));
            this.player.party = (parsedData.player.party || [])
                .map(pData => partnersMap.get(pData.id))
                .filter(Boolean);
            
            this.resources = parsedData.resources;
            
            const defaultBuildings = {
                dungeon: { level: 0, name: "地牢" }, warehouse: { level: 0, name: "倉庫" },
                barracks: { level: 0, name: "寢室" }, armory: { level: 0, name: "兵工廠" },
                maternity: { level: 0, name: "產房" }, trainingGround: { level: 0, name: "訓練場" }, 
                merchantCamp: { level: 0, name: "商人營地" },
            };
            this.buildings = { ...defaultBuildings, ...parsedData.buildings };

            this.day = parsedData.day;
            this.dispatch = parsedData.dispatch || { hunting: [], logging: [], mining: [] }; 
            this.narrativeMemory = parsedData.narrativeMemory;
            this.tutorial = { ...{ active: false, step: 0, merchantMet: false }, ...parsedData.tutorial };
            this.breedingChargesLeft = parsedData.breedingChargesLeft;
            this.merchant = { ...this.merchant, ...parsedData.merchant };
            
            this.player.updateHp(this.isStarving);
            this.partners.forEach(p => p.updateHp(this.isStarving));

            if (parsedData.tempStatIncreases) {
                this.tempStatIncreases = parsedData.tempStatIncreases;
            } else {
                this.cancelAttributePoints();
            }
            
            this.salvageSaveData();
            this.migrateSaveData();
                
            this.screen = 'tribe';
            this.showCustomAlert('遊戲進度已讀取！');

        } catch (e) {
            console.error("讀取存檔失敗:", e);
            this.showCustomAlert(`讀取存檔失敗！檔案可能已損毀。錯誤訊息: ${e.message}`);
        }
    },

    checkForSaveFile() {
        if (localStorage.getItem('goblinKingSaveFile')) {
            this.hasSaveFile = true;
        }
    },
    
    craftableTypes: [
        { baseName: '劍', type: 'weapon', slot: 'mainHand' },
        { baseName: '雙手劍', type: 'weapon', slot: 'mainHand' },
        { baseName: '長槍', type: 'weapon', slot: 'mainHand' },
        { baseName: '弓', type: 'weapon', slot: 'mainHand' },
        { baseName: '法杖', type: 'weapon', slot: 'mainHand' },
        { baseName: '盾', type: 'weapon', slot: 'offHand' },
        { baseName: '鎧甲', type: 'armor', slot: 'chest' },
    ],
    get availableMaterials() {
        if (this.buildings.armory.level === 0) return [];
        const tierMap = [0, 1, 3, 5, 7];
        const maxTier = tierMap[this.buildings.armory.level] || 0;
        return Object.entries(EQUIPMENT_MATERIALS)
            .filter(([key, mat]) => mat.tier <= maxTier)
            .map(([key, mat]) => ({ key: key, name: mat.name }));
    },
    getCraftingCost() {
        const materialKey = this.modals.armory.craftingMaterial;
        if (!materialKey || !EQUIPMENT_MATERIALS[materialKey]) {
            return { amount: 0, type: '' };
        }
        const material = EQUIPMENT_MATERIALS[materialKey];
        return {
            amount: material.cost,
            type: material.type === 'metal' ? '礦石' : '木材'
        };
    },
    get canAffordCraft() {
        const cost = this.getCraftingCost();
        if (cost.type === '礦石') {
            return this.resources.stone >= cost.amount;
        }
        if (cost.type === '木材') {
            return this.resources.wood >= cost.amount;
        }
        return false;
    },
    craftItem() {
        if (!this.canAffordCraft) {
            this.showCustomAlert('資源不足！');
            return;
        }
        // 【修正】將 equipmentCapacity 改為正確的 backpackCapacity，以正確檢查背包容量
        if (this.player.inventory.length >= this.backpackCapacity) {
            this.showCustomAlert('你的背包已滿，無法製作新裝備！');
            return;
        }
        const cost = this.getCraftingCost();
        if (cost.type === '礦石') {
            this.resources.stone -= cost.amount;
        } else {
            this.resources.wood -= cost.amount;
        }

        const roll = randomInt(1, 100);
        let qualityKey = 'worn';
        if (roll <= 5) qualityKey = 'legendary';      // GDD 13.5 機率為 5%
        else if (roll <= 15) qualityKey = 'epic';     // GDD 13.5 機率為 10%
        else if (roll <= 32) qualityKey = 'rare';     // GDD 13.5 機率為 17%
        else if (roll <= 58) qualityKey = 'uncommon'; // GDD 13.5 機率為 26%
        else if (roll <= 93) qualityKey = 'common';   // GDD 13.5 機率為 35%
                                                    // 剩下 7% 為 worn

        const newItem = this.createEquipment(
            this.modals.armory.craftingMaterial,
            qualityKey,
            this.modals.armory.craftingType
        );

        this.player.inventory.push(newItem);
        this.logMessage('tribe', `你成功製作了 <span style="color:${newItem.quality.color};">[${newItem.name}]</span>！`, 'success');

        // 【新增】顯示一個包含詳細結果的提示框，給予玩家即時回饋
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

        const material = item.material;
        const returnRate = [0.2, 0.3, 0.4, 0.5][this.buildings.armory.level - 1] || 0;
        const resourcesBack = Math.floor(material.cost * returnRate);

        if (material.type === 'metal') {
            this.resources.stone += resourcesBack;
            this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 礦石。`, 'info');
        } else {
            this.resources.wood += resourcesBack;
            this.logMessage('tribe', `你分解了 [${item.name}]，回收了 ${resourcesBack} 木材。`, 'info');
        }

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
        
        let itemIndex = this.player.inventory.findIndex(i => i.id === itemId);
        let sourceArray = this.player.inventory;
        if (itemIndex === -1) {
            itemIndex = this.warehouseInventory.findIndex(i => i.id === itemId);
            sourceArray = this.warehouseInventory;
        }
        if (itemIndex === -1) return;

        const itemToEquip = sourceArray[itemIndex];
        let slot = itemToEquip.slot; 

        const mainHandWeapon = targetUnit.equipment.mainHand;
        if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName === '劍' && !targetUnit.equipment.offHand) {
            slot = 'offHand';
        }
        
        if (!slot || !targetUnit.equipment.hasOwnProperty(slot)) return;

        if (slot === 'offHand') {
            if (mainHandWeapon && TWO_HANDED_WEAPONS.includes(mainHandWeapon.baseName)) {
                this.showCustomAlert(`裝備 ${mainHandWeapon.baseName} 時無法使用副手裝備！`);
                return;
            }
            if (itemToEquip.baseName === '劍' && mainHandWeapon?.baseName !== '劍') {
                this.showCustomAlert('只有在主手裝備單手劍時，才能在副手裝備另一把劍！');
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
        this.logMessage('tribe', `${targetUnit.name} 裝備了 <span style="color:${itemToEquip.quality.color};">[${itemToEquip.name}]</span>。`, 'success');
        
    },

    unequipItem(slot, targetUnit, silent = false) {
        if (!targetUnit || !targetUnit.equipment[slot]) return;
        
        const itemToUnequip = targetUnit.equipment[slot];

        if (this.screen === 'raid') {
            // 在掠奪中 -> 卸到背包
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
        // 顯示基礎屬性
        if (item.stats && Object.keys(item.stats).length > 0) {
            const statsString = Object.entries(item.stats).map(([key, value]) => {
                if (key === 'blockChance') {
                    return `${STAT_NAMES[key] || key} +${value}%`;
                }
                return `${STAT_NAMES[key] || key} +${value}`;
            }).join(', ');
            parts.push(statsString);
        }
        // 顯示詞綴效果
        item.affixes.forEach(affix => {
            if (affix.type === 'stat') {
                const effectString = affix.effects.map(e => {
                    const statName = e.stat === 'all' ? '全能力' : (STAT_NAMES[e.stat] || e.stat);
                    return e.type === 'multiplier' ? `${statName} x${e.value}` : `${statName} +${e.value}`;
                }).join('/');
                parts.push(`<span class="text-green-400">${affix.name}: ${effectString}</span>`);
            } else if (affix.type === 'proc') {
                parts.push(`<span class="text-blue-400">${affix.name} (機率性效果)</span>`);
            }
        });
        // 顯示特殊詛咒詞綴效果
        if (item.specialAffix) {
            const affixDesc = {
                'strength_curse': '脫力(基礎力=0時+10力, 否則全能力-10)',
                'agility_curse': '遲鈍(基礎敏=0時+10敏, 否則全能力-10)',
                'intelligence_curse': '愚鈍(基礎智=0時+10智, 否則全能力-10)',
                'luck_curse': '不幸(基礎運=0時+10運, 否則全能力-10)',
                'gundam_curse': '肛蛋(基礎2項=0時, 該2項+8, 否則全能力-8)',
                'henshin_curse': '變身(基礎3項=0時, 該3項+5, 否則全能力-5)',
            }[item.specialAffix] || '';
            if (affixDesc) {
                parts.push(`<span class="text-red-400">${affixDesc}</span>`);
            }
        }

        return parts.join('<br>');
    },
    get availablePartnersForDispatch() {
        // 取得所有未被派遣的夥伴
        const dispatchedIds = new Set([
            ...this.dispatch.hunting,
            ...this.dispatch.logging,
            ...this.dispatch.mining
        ]);
        return this.partners.filter(p => !dispatchedIds.has(p.id));
    },
    get availablePartnersForParty() {
        // 這份清單只會顯示「沒有」被派遣的哥布林
        const dispatchedIds = new Set([
            ...this.dispatch.hunting,
            ...this.dispatch.logging,
            ...this.dispatch.mining
        ]);
        return this.partners.filter(p => !dispatchedIds.has(p.id));
    },
    getDispatchedPartners(task) {
        // 根據任務類型取得已被派遣的夥伴列表
        const partnerMap = new Map(this.partners.map(p => [p.id, p]));
        return this.dispatch[task].map(id => partnerMap.get(id)).filter(Boolean);
    },
    openDispatchModal() {
        this.modals.dispatch.isOpen = true;
    },
    assignToDispatch(partnerId, task) {
        if (this.dispatch[task].length >= 10) {
            this.showCustomAlert('這個隊伍已經滿員了！');
            return;
        }
        // 從其他隊伍中移除
        Object.keys(this.dispatch).forEach(key => {
            this.dispatch[key] = this.dispatch[key].filter(id => id !== partnerId);
        });
        // 加入到新隊伍
        this.dispatch[task].push(partnerId);

        // 檢查並將夥伴從出擊隊伍中移除
        if (this.player && this.player.party) {
            const initialPartySize = this.player.party.length;
            this.player.party = this.player.party.filter(p => p.id !== partnerId);
            
            // 如果隊伍成員真的有變動，則更新玩家的生命值 (因為夥伴加成會改變)
            if (this.player.party.length !== initialPartySize) {
                this.player.updateHp(this.isStarving);
            }
        }
    },
    removeFromDispatch(partnerId, task) {
        this.dispatch[task] = this.dispatch[task].filter(id => id !== partnerId);
    },
    
    getGoblinYield(goblin, task) {
        if (!goblin) return 0;

        // 使用 getTotalStat 來計算包含裝備加成的總四圍
        const totalStats = goblin.getTotalStat('strength', this.isStarving) +
                        goblin.getTotalStat('agility', this.isStarving) +
                        goblin.getTotalStat('intelligence', this.isStarving) +
                        goblin.getTotalStat('luck', this.isStarving);
        
        // 統一獲取裝備血量加成
        const equipmentHp = goblin.getEquipmentBonus('hp');

        switch (task) {
            case 'hunting': {
                // 打獵的產量 = (總四圍 * 0.2) + (總傷害 * 0.2) + (裝備血量 * 0.05)
                const damage = goblin.calculateDamage(this.isStarving);
                return Math.floor(totalStats * 0.2 + damage * 0.2 + equipmentHp * 0.05);
            }
            case 'logging':
            case 'mining': {
                // 伐木和採礦的產量 = (總四圍 * 0.2) + (裝備血量 * 0.05)
                return Math.floor(totalStats * 0.2 + equipmentHp * 0.05);
            }
            default:
                return 0;
        }
    },
    calculateDispatchYields() {
        // 升級後的「每日結算」函式，現在它會使用上面的計算機
        const huntingGoblins = this.getDispatchedPartners('hunting');
        const loggingGoblins = this.getDispatchedPartners('logging');
        const miningGoblins = this.getDispatchedPartners('mining');

        const foodGained = huntingGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'hunting'), 0);
        const woodGained = loggingGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'logging'), 0);
        const stoneGained = miningGoblins.reduce((sum, goblin) => sum + this.getGoblinYield(goblin, 'mining'), 0);

        if (foodGained > 0) {
            this.resources.food = Math.min(this.foodCapacity, this.resources.food + foodGained);
            this.logMessage('tribe', `打獵隊帶回了 ${foodGained} 單位食物。`, 'success');
        }
        if (woodGained > 0) {
            this.resources.wood = Math.min(this.woodCapacity, this.resources.wood + woodGained);
            this.logMessage('tribe', `伐木隊帶回了 ${woodGained} 單位木材。`, 'success');
        }
        if (stoneGained > 0) {
            this.resources.stone = Math.min(this.stoneCapacity, this.resources.stone + stoneGained);
            this.logMessage('tribe', `採礦隊帶回了 ${stoneGained} 單位礦石。`, 'success');
        }
    },  
};