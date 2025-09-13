// js/modules/raid.js

const raidModule = {
    // 生成伏擊隊伍的輔助函式
    generateAmbushParty(difficulty, x, y) {
        const ambushers = [];
        const numAmbusher = randomInt(2, 3); // 生成 2-3 名伏擊者
        const guardTypes = Object.keys(BEASTKIN_CHAMPIONS);
        const guardStatRange = ENEMY_STAT_RANGES['normal'].guard;

        for (let i = 0; i < numAmbusher; i++) {
            const guardType = guardTypes[randomInt(0, guardTypes.length - 1)];
            const totalStatPoints = randomInt(guardStatRange[0], guardStatRange[1]);
            const unit = new MaleHuman(guardType, distributeStats(totalStatPoints), guardType, difficulty, 'beastkin');
            this.equipEnemy(unit, difficulty);
            
            // 讓伏擊者出現在假人附近
            unit.x = x + randomInt(-10, 10);
            unit.y = y + randomInt(-10, 10);
            
            ambushers.push(unit);
        }
        return ambushers;
    },
    updateRaidTimeCycle() {
        if (!this.currentRaid || this.currentRaid.timeCycleFlipped) {
            return;
        }

        // 當時間剩下 50% 或更少時
        if (this.currentRaid.timeRemaining <= this.currentRaid.totalTime / 2) {
            const difficulty = this.currentRaid.difficulty;
            if (difficulty === 'dlc_elf_normal' && this.currentRaid.timeCycle === 'night') {
                this.currentRaid.timeCycle = 'day';
                this.currentRaid.timeCycleFlipped = true;
                this.logMessage('raid', '太陽升起，森林沐浴在陽光下！精靈們的力量增強了！', 'system');
            } else if (difficulty === 'dlc_beastkin_normal' && this.currentRaid.timeCycle === 'day') {
                this.currentRaid.timeCycle = 'night';
                this.currentRaid.timeCycleFlipped = true;
                this.logMessage('raid', '夜幕降臨，野性的咆哮在平原上迴盪！亞獸人們的力量增強了！', 'system');
            }
        }
    },
    startRaid(difficulty) {
        this.logs.raid = [];
        if (this.buildings.dungeon.level === 0) {
            this.showCustomAlert('地牢尚未建造，無法發動掠奪來抓捕俘虜！');
            return;
        }
        this.currentRaid = this.generateCity(difficulty);
        this.currentRaid.reinforcementsDefeated = false;
        this.screen = 'raid';

        this.playerMapPosition = { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 30 };

        this.logMessage('raid', `你帶領隊伍前往 ${this.currentRaid.locationName} 進行掠奪！`, 'player');
    },

    generateCity(difficulty) {
        const config = {
            easy: { time: 300, zones: ['外城', '內城'], pop: [10, 15], guards: [5, 10], knightStats: [65, 120] },
            normal: { time: 240, zones: ['外城', '內城A', '內城B'], pop: [15, 25], guards: [10, 15], knightStats: [120, 190] },
            hard: { time: 180, zones: ['外城', '內城A', '內城B', '內城C'], pop: [25, 30], guards: [15, 20], knightStats: [190, 280] },
            hell: { time: 120, zones: ['外城', '內城A', '內城B', '內城C', '王城'], pop: [35, 40], guards: [20, 25], knightStats: [280, 360] },
            dlc_elf_normal: { time: 240, zones: ['森林外圍', '林中空地', '古樹聖殿'], pop: [20, 25], guards: [10, 15], knightStats: [120, 190] },
            dlc_beastkin_normal: { time: 240, zones: ['平原邊境', '狩獵營地', '酋長帳篷'], pop: [20, 25], guards: [10, 15], knightStats: [120, 190] },
        };
        const cityConfig = config[difficulty];
        const nameConfig = { 
            ...CITY_NAMES,
            dlc_elf_normal: { prefixes: ['銀月', '翠葉', '微光', '迷霧'], suffix: '森林' },
            dlc_beastkin_normal: { prefixes: ['咆哮', '血蹄', '風剪', '巨岩'], suffix: '平原' }
        };
        const locationName = nameConfig[difficulty].prefixes[randomInt(0, nameConfig[difficulty].prefixes.length - 1)] + nameConfig[difficulty].suffix;

        let city = {
            difficulty, locationName, timeRemaining: cityConfig.time, totalTime: cityConfig.time,
            zones: [], currentZoneIndex: 0,
            get currentZone() { return this.zones[this.currentZoneIndex]; },
            carriedCaptives: [], failedSneakTargets: new Set(),
            timeCycle: 'neutral', timeCycleFlipped: false 
        };
        if (difficulty === 'dlc_elf_normal') city.timeCycle = 'night';
        else if (difficulty === 'dlc_beastkin_normal') city.timeCycle = 'day';

        city.zones = cityConfig.zones.map(name => ({
            name: name, buildings: [], enemies: [], resources: { food: 0, wood: 0, stone: 0 }
        }));

        const gridCols = Math.floor(MAP_WIDTH / GRID_SIZE);
        const gridRows = Math.floor(MAP_HEIGHT / GRID_SIZE);
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
                    return { x: c * GRID_SIZE + (GRID_SIZE / 4), y: potentialY };
                }
                attempts++;
            }
            const safeMapHeight = MAP_HEIGHT - paddingTop - paddingBottom;
            return { x: randomInt(20, MAP_WIDTH - 20), y: randomInt(paddingTop, paddingTop + safeMapHeight) };
        };

        let allGuards = [];
        let allResidents = [];
        const totalResidents = randomInt(cityConfig.pop[0], cityConfig.pop[1]);
        const totalGuards = randomInt(cityConfig.guards[0], cityConfig.guards[1]);

        if (difficulty.startsWith('dlc_')) {
            const isElf = difficulty.includes('elf');
            const race = isElf ? 'elf' : 'beastkin';
            const guardTypes = isElf ? Object.keys(HIGH_ELF_GUARDS) : Object.keys(BEASTKIN_CHAMPIONS);
            const dlcDifficultyKey = `dlc_${difficulty.split('_').pop()}`; 
            const guardStatRange = ENEMY_STAT_RANGES[dlcDifficultyKey].guard;
            const residentStatRange = ENEMY_STAT_RANGES[dlcDifficultyKey].resident;
            allGuards = Array.from({ length: totalGuards }, () => {
                const guardType = guardTypes[randomInt(0, guardTypes.length - 1)];
                const totalStatPoints = randomInt(guardStatRange[0], guardStatRange[1]);
                const unit = new MaleHuman(guardType, distributeStats(totalStatPoints), guardType, difficulty, race);
                this.equipEnemy(unit, difficulty);
                return unit;
            });
            allResidents = Array.from({ length: totalResidents }, () => {
                const profession = isElf ? '精靈居民' : '亞獸人居民';
                const totalStatPoints = randomInt(residentStatRange[0], residentStatRange[1]);
                const visual = generateVisuals();
                if (isElf) {
                    visual.elfEars = VISUAL_OPTIONS.elfEars[randomInt(0, VISUAL_OPTIONS.elfEars.length - 1)];
                }
                if (rollPercentage(70)) {
                    const stats = distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']);
                    return new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], stats, profession, visual, difficulty, race);
                } else {
                    return new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(totalStatPoints), `男性${profession}`, difficulty, race);
                }
            });
        } else {
            allGuards = Array.from({ length: totalGuards }, () => {
                const statRange = ENEMY_STAT_RANGES[difficulty].guard;
                const totalStatPoints = randomInt(statRange[0], statRange[1]);
                const isFemale = rollPercentage(50);
                let guard;
                if (isFemale) {
                    guard = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']), '城市守軍', generateVisuals(), difficulty);
                } else {
                    guard = new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(totalStatPoints), '城市守軍');
                }
                this.equipEnemy(guard, difficulty);
                return guard;
            });
            allResidents = Array.from({ length: totalResidents }, () => {
                const statRange = ENEMY_STAT_RANGES[difficulty].resident;
                const isFemale = rollPercentage(50);
                if (isFemale) {
                    const profession = PROFESSIONS[randomInt(0, PROFESSIONS.length - 1)];
                    return new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1]), ['strength', 'agility', 'intelligence', 'luck', 'charisma']), profession, generateVisuals(), difficulty);
                } else {
                    return new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(randomInt(statRange[0], statRange[1])), '男性居民');
                }
            });
        }
        
        // 【全新且修正的單位分配邏輯】
        const outerGuardsCount = Math.floor(totalGuards * 0.25);
        const outerGuards = allGuards.slice(0, outerGuardsCount);
        const innerGuards = allGuards.slice(outerGuardsCount);
        const innerZones = city.zones.slice(1).filter(z => z.name !== '王城');

        if (outerGuards.length > 0) {
            const pos = getFreePosition(city.zones[0], true);
            const guardPostType = difficulty.startsWith('dlc_') ? '前線哨站' : '衛兵所';
            city.zones[0].buildings.push({ 
                id: crypto.randomUUID(), type: guardPostType, occupants: outerGuards, looted: false, resources: { food: 0, wood: 0, stone: 0 },
                scoutState: 'hidden', postScoutText: '',
                x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
            });
        }
        
        if (innerZones.length > 0) {
            let currentGuardIndex = 0;
            while(currentGuardIndex < innerGuards.length) {
                const groupSize = randomInt(2, 3);
                const patrolTeam = innerGuards.slice(currentGuardIndex, currentGuardIndex + groupSize);
                if (patrolTeam.length > 0) {
                    const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                    const pos = getFreePosition(targetZone);
                    patrolTeam.forEach(unit => { 
                        unit.x = pos.x; unit.y = pos.y; unit.scoutState = 'hidden';
                    });
                    targetZone.enemies.push(patrolTeam);
                }
                currentGuardIndex += groupSize;
            }

            const buildingCount = Math.ceil(totalResidents / 1.5);
            for (let i = 0; i < buildingCount; i++) {
                const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                const pos = getFreePosition(targetZone, true);
                targetZone.buildings.push({
                    id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                    occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                    scoutState: 'hidden', postScoutText: '',
                    x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                });
            }
            
            innerZones.forEach(zone => {
                while (zone.buildings.length > 0 && zone.buildings.length < 3) {
                    const pos = getFreePosition(zone, true);
                    zone.buildings.push({
                        id: crypto.randomUUID(), type: BUILDING_TYPES[randomInt(0, BUILDING_TYPES.length - 2)],
                        occupants: [], looted: false, resources: { food: 0, wood: 0, stone: 0 },
                        scoutState: 'hidden', postScoutText: '',
                        x: pos.x, y: pos.y, width: GRID_SIZE / 2, height: GRID_SIZE / 2
                    });
                }
            });

            const allInnerBuildings = innerZones.flatMap(z => z.buildings);
            let dummyPlaced = false; 
            allResidents.forEach(resident => {
                let finalUnit = resident;
                if (difficulty === 'dlc_beastkin_normal' && !dummyPlaced && !resident.profession.includes('男性')) {
                    if (rollPercentage(15)) {
                        finalUnit = new MaleHuman('偽裝的俘虜', { strength: 1, agility: 1, intelligence: 1, luck: 1 }, '氣味標記假人', difficulty, 'beastkin');
                        dummyPlaced = true;
                    }
                }
                if(rollPercentage(5) && !difficulty.startsWith('dlc_') && finalUnit.profession !== '氣味標記假人') { 
                    const knightStatRange = cityConfig.knightStats;
                    const knightTypes = Object.keys(KNIGHT_ORDER_UNITS);
                    const randomKnightType = knightTypes[randomInt(0, knightTypes.length - 1)];
                    const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                    finalUnit = rollPercentage(50) ? new FemaleKnightOrderUnit(randomKnightType, totalStatPoints, difficulty) : new KnightOrderUnit(randomKnightType, totalStatPoints);
                }
                if (finalUnit.profession !== '氣味標記假人') {
                    this.equipEnemy(finalUnit, difficulty);
                }
                if (rollPercentage(80) && allInnerBuildings.length > 0) {
                    const randomBuilding = allInnerBuildings[randomInt(0, allInnerBuildings.length - 1)];
                    randomBuilding.occupants.push(finalUnit);
                } else {
                    const targetZone = innerZones[randomInt(0, innerZones.length - 1)];
                    const pos = getFreePosition(targetZone);
                    finalUnit.x = pos.x; finalUnit.y = pos.y; finalUnit.scoutState = 'hidden';
                    targetZone.enemies.push([finalUnit]);
                }
            });

            if (difficulty === 'dlc_elf_normal' && allInnerBuildings.length > 0) {
                if (rollPercentage(25)) {
                    const targetBuilding = allInnerBuildings[randomInt(0, allInnerBuildings.length - 1)];
                    targetBuilding.isDisguisedEnemy = true;
                    targetBuilding.disguisedAs = '精靈樹屋';
                    targetBuilding.type = '奇異的樹屋';
                    const treantStatPoints = randomInt(ENEMY_STAT_RANGES['normal'].guard[0], ENEMY_STAT_RANGES['normal'].guard[1]);
                    const treant = new MaleHuman('樹人守衛', distributeStats(treantStatPoints), '樹人守衛', difficulty, 'elf');
                    this.equipEnemy(treant, 'hard'); 
                    targetBuilding.occupants = [treant];
                }
            }
        }
        const resConfig = {
            easy: { food: [100, 200], wood: [50, 100], stone: [50, 100] },
            normal: { food: [200, 400], wood: [100, 200], stone: [100, 200] },
            hard: { food: [400, 800], wood: [200, 400], stone: [200, 400] },
            hell: { food: [800, 1600], wood: [400, 800], stone: [400, 800] },
            dlc_elf_normal: { food: [200, 400], wood: [100, 200], stone: [100, 200] },
            dlc_beastkin_normal: { food: [200, 400], wood: [100, 200], stone: [100, 200] },
        };
        if (resConfig[difficulty]) {
            const totalFood = randomInt(resConfig[difficulty].food[0], resConfig[difficulty].food[1]);
            const totalWood = randomInt(resConfig[difficulty].wood[0], resConfig[difficulty].wood[1]);
            const totalStone = randomInt(resConfig[difficulty].stone[0], resConfig[difficulty].stone[1]);
            const allCityBuildings = city.zones.flatMap(z => z.buildings);
            if(allCityBuildings.length > 0) {
                for(let i = 0; i < totalFood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.food++;
                for(let i = 0; i < totalWood; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.wood++;
                for(let i = 0; i < totalStone; i++) allCityBuildings[randomInt(0, allCityBuildings.length - 1)].resources.stone++;
            }
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
        const playerPartySize = [this.player, ...this.player.party].length;
        const zone = this.currentRaid.currentZone;
        const hiddenBuildings = zone.buildings.filter(b => b.scoutState === 'hidden');
        const hiddenEnemies = zone.enemies.filter(group => group.length > 0 && group[0].scoutState === 'hidden');
        let availableTargets = [...hiddenBuildings, ...hiddenEnemies];

        if (availableTargets.length === 0) {
            this.logMessage('raid', '你已經將此區域偵查完畢，沒有新的發現。', 'info');
            return;
        }

        const targetsToRevealCount = Math.min(playerPartySize, availableTargets.length);
        this.currentRaid.timeRemaining -= 2;
        this.logMessage('raid', `你開始仔細偵查周遭環境，尋找目標... (-2 分鐘)`, 'info');

        const revealedTargetNames = [];

        for (let i = 0; i < targetsToRevealCount; i++) {
            const randomIndex = randomInt(0, availableTargets.length - 1);
            const [targetToReveal] = availableTargets.splice(randomIndex, 1);
            let targetName = '';
            if (Array.isArray(targetToReveal)) {
                const representativeEnemy = targetToReveal[0];
                targetToReveal.forEach(unit => unit.scoutState = 'revealed');
                targetName = `一支由 ${representativeEnemy.name} 帶領的隊伍`;
            } else {
                targetToReveal.scoutState = 'revealed';
                targetName = `一棟 ${targetToReveal.type}`;
            }
            revealedTargetNames.push(targetName);
        }

        if (revealedTargetNames.length > 0) {
            this.logMessage('raid', `偵查成功！你們發現了 ${revealedTargetNames.join('、')} 的位置。`, 'success');
            this.currentRaid.currentZone = { ...this.currentRaid.currentZone };
        }
        
        this.checkRaidTime();
    },
   
    scoutTarget(targetOrGroup) {
        if (!targetOrGroup || (Array.isArray(targetOrGroup) && targetOrGroup.length === 0)) {
            this.showCustomAlert("偵查目標無效！");
            return;
        }
        const isGroup = Array.isArray(targetOrGroup);
        const representativeTarget = isGroup ? targetOrGroup[0] : targetOrGroup;

        // 處理樹人守衛 (偽裝建築) 的邏輯
        if (!isGroup && representativeTarget.isDisguisedEnemy) {
            this.logMessage('raid', `你靠近的 ${representativeTarget.type} 突然動了起來！這不是建築，是樹人守衛！`, 'enemy');
            this.selectedTarget = null; // 清除選中目標，避免介面殘留
            
            // 設定勝利後的回呼：將建築變回普通狀態
            this.combat.onVictoryCallback = () => {
                representativeTarget.isDisguisedEnemy = false;
                representativeTarget.type = representativeTarget.disguisedAs;
                this.updateBuildingScoutText();
                this.logMessage('raid', '樹人守衛倒下了，露出了它守護的居所。', 'success');
                this.combat.onVictoryCallback = null;
            };
            
            this.startCombat(representativeTarget.occupants, true);
            return; // 中斷後續的偵查邏輯
        }

        // 處理氣味標記假人 (誘餌) 的邏輯 (下一步會用到)
        if (isGroup && representativeTarget.profession === '氣味標記假人') {
            this.logMessage('raid', `你仔細一看，發現 ${representativeTarget.name} 只是個稻草假人！身上的氣味引來了埋伏！`, 'enemy');
            this.selectedTarget = null;

            const ambushers = this.generateAmbushParty(this.currentRaid.difficulty, representativeTarget.x, representativeTarget.y);
            this.removeUnitFromRaidZone(representativeTarget.id);
            this.startCombat(ambushers, true);
            return;
        }

        const targetNameForLog = isGroup ? '一個隊伍' : (representativeTarget.type || representativeTarget.name);
        
        if (representativeTarget.scoutState === 'scouted') {
            this.modals.scoutInfo.target = isGroup ? targetOrGroup : (representativeTarget.occupants || []);
            this.modals.scoutInfo.emptyBuildingMessage = representativeTarget.looted ? '這棟建築是空的，你已搜刮過。' : '這棟建築是空的，看來可以搜刮一番。';
            this.modals.scoutInfo.isOpen = true;
            this.logMessage('raid', `你再次查看了 ${targetNameForLog} 的情報。`, 'info');
            return;
        }
        
        if (!isGroup && representativeTarget.occupants && representativeTarget.occupants.length === 0) {
            this.currentRaid.timeRemaining -= 2;
            this.logMessage('raid', `偵查成功！你發現 ${targetNameForLog} 是空的。(-2 分鐘)`, 'success');
            
            representativeTarget.scoutState = 'scouted';
            this.updateBuildingScoutText();
            
            this.modals.scoutInfo.target = [];
            this.modals.scoutInfo.emptyBuildingMessage = representativeTarget.looted ? '這棟建築是空的，你已搜刮過。' : '這棟建築是空的，看來可以搜刮一番。';
            this.modals.scoutInfo.isOpen = true;
            this.checkRaidTime();
            return;
        }

        const playerParty = [this.player, ...this.player.party];
        const enemiesToScout = isGroup ? targetOrGroup : representativeTarget.occupants;
        const contestResult = this.performAbilityContest(playerParty, enemiesToScout);

        this.logMessage('raid', `我方偵查擲骰: ${contestResult.partyA_Details.roll} (基於 ${contestResult.partyA_Details.diceCount}d10) + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('raid', `敵方隱蔽擲骰: ${contestResult.partyB_Details.roll} (基於 ${contestResult.partyB_Details.diceCount}d10) + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');

        if (contestResult.partyA_Value > contestResult.partyB_Value) { 
            this.currentRaid.timeRemaining -= 2;
            
            if (isGroup) {
                targetOrGroup.forEach(unit => unit.scoutState = 'scouted');
            } else {
                representativeTarget.scoutState = 'scouted';
            }
            this.updateBuildingScoutText();

            this.logMessage('raid', `你成功偵查了 ${targetNameForLog} 的詳細情報！(-2 分鐘)`, 'success');
            this.modals.scoutInfo.target = enemiesToScout;
            this.modals.scoutInfo.isOpen = true;
        } else {
            this.currentRaid.timeRemaining -= 4;
            this.logMessage('raid', `偵查 ${targetNameForLog} 失敗！(-4 分鐘)`, 'enemy');
        }
        this.checkRaidTime();
    },

    lootBuilding(building) {
        if(building.looted) return;

        const zone = this.currentRaid.currentZone;
        const isInnerCity = zone.name.includes('內城') || zone.name === '王城';
        const patrolsExist = zone.enemies && zone.enemies.length > 0;
        if (isInnerCity && patrolsExist) {
            const patrolGroupCount = zone.enemies.length;
            const totalBuildingCount = zone.buildings.length;
            if (totalBuildingCount > 0) {
                const discoveryChance = (patrolGroupCount / (totalBuildingCount * 4)) * 100;
                if (rollPercentage(discoveryChance)) {
                    this.logMessage('raid', `你搜刮 ${building.type} 的聲音太大，驚動了附近的一支巡邏隊！`, 'enemy');
                    const patrolToFight = zone.enemies[randomInt(0, patrolGroupCount - 1)];
                    this.startCombat(patrolToFight, true);
                    return; 
                }
            }
        }

        this.currentRaid.timeRemaining -= 3;
        let foodFound = building.resources.food;
        let woodFound = building.resources.wood;
        let stoneFound = building.resources.stone;

        const deepScavengingId = 'raid_deep_scavenging';
        if (this.player && this.player.learnedSkills[deepScavengingId]) {
            const skillLevel = this.player.learnedSkills[deepScavengingId];
            const skillData = SKILL_TREES.raiding.find(s => s.id === deepScavengingId);
            const multiplier = skillData.levels[skillLevel - 1].effect.multiplier;
            foodFound = Math.floor(foodFound * multiplier);
            woodFound = Math.floor(woodFound * multiplier);
            stoneFound = Math.floor(stoneFound * multiplier);
        }
        
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
        
        this._generateAndAwardLoot({
            baseDropRate: 20,
            possibleQualities: ['common', 'uncommon'],
            difficulty: this.currentRaid.difficulty,
            sourceName: `a looted ${building.type}`
        });
        
        const reappearingAuthId = 'raid_reappearing_authority';
        if (this.player && this.player.learnedSkills[reappearingAuthId]) {
            const skillData = SKILL_TREES.raiding.find(s => s.id === reappearingAuthId);
            if (rollPercentage(skillData.levels[0].effect.chance * 100)) {
                building.looted = false;
                building.postScoutText = ' (可再次搜刮)';
                this.logMessage('raid', `在「重現的權能」影響下，${building.type} 內的資源似乎又重新出現了！`, 'crit');
            }
        }
            
        this.checkRaidTime();
    },

    canAdvance() {
        if (!this.currentRaid) return false;

        // 王城有自己的特殊推進邏輯
        if (this.currentRaid.currentZone.name === '王城') {
            const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
            return castle && castle.scouted;
        }

        // 定義所有被視為「守軍」的職業
        const guardProfessions = new Set([
            '城市守軍',
            ...Object.keys(HIGH_ELF_GUARDS),
            ...Object.keys(BEASTKIN_CHAMPIONS)
        ]);

        // 檢查是否還有守軍存活
        const hasLivingGuards = 
            this.currentRaid.currentZone.enemies.flat().some(e => guardProfessions.has(e.profession)) ||
            this.currentRaid.currentZone.buildings.some(b => b.occupants.some(o => guardProfessions.has(o.profession)));

        // 條件：尚未到最後一區，且區域內沒有任何守軍存活
        return this.currentRaid.currentZoneIndex < this.currentRaid.zones.length - 1 && !hasLivingGuards;
    },

    advanceToNextZone(force = false) {
        const castle = this.currentRaid.currentZone.buildings.find(b => b.isFinalChallenge);
        if (this.currentRaid.currentZone.name === '王城' && castle && castle.scouted) {
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
        const guardPost = this.currentRaid.currentZone.buildings.find(b => (b.type === '衛兵所' || b.type === '前線哨站'));
        if (!guardPost || guardPost.occupants.length === 0) {
            this.showCustomAlert('外城沒有守軍可以繞過。');
            return;
        }

        const outerGuards = guardPost.occupants;
        const playerAgility = this.player.getTotalStat('agility', this.isStarving);
        const enemyAvgAgility = outerGuards.reduce((sum, e) => sum + e.stats.agility, 0) / outerGuards.length;
        
        let penalty = ((this.player.party.length + 1) - outerGuards.length) * 2;
        if (penalty > 0) {
            const skillId = 'raid_dispersed_escape';
            if (this.player && this.player.learnedSkills[skillId]) {
                const skillLevel = this.player.learnedSkills[skillId];
                const skillData = SKILL_TREES.raiding.find(s => s.id === skillId);
                const reduction = skillData.levels[skillLevel - 1].effect.penalty_reduction;
                penalty *= (1 - reduction);
            }
        }

        const successChance = 50 + (playerAgility - enemyAvgAgility) * 1.5 - penalty;

        if (rollPercentage(successChance)) {
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行成功！你花費了 3 分鐘，悄悄地繞過了守軍。`, 'success');
            this.advanceToNextZone(true);
            this.checkRaidTime();
        } else {
            this.currentRaid.timeRemaining -= 6;
            this.logMessage('raid', `潛行失敗！你被守軍發現了！(-6 分鐘)`, 'enemy');
            this.startCombat(outerGuards, guardPost.scoutState !== 'scouted');
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
            
            this.isRetreatingWhenTimeExpired = true;
            this.checkRaidTime(); 
            
            if (this.currentRaid && this.currentRaid.timeRemaining > 0) {
                this.prepareToEndRaid();
            }
            
        } else {
            const oldZoneName = this.currentRaid.currentZone.name;
            this.currentRaid.currentZoneIndex--;
            this.currentRaid.timeRemaining -= 5;
            const newZoneName = this.currentRaid.currentZone.name;
            
            this.logMessage('raid', `你從 ${oldZoneName} 撤退回了 ${newZoneName}。(-5 分鐘)`, 'player');
            this.checkRaidTime();
        }
    },

    prepareToEndRaid(wasDefeated = false) {
        if (wasDefeated) {
            this.endRaid(true);
            return;
        }
        
        const newCaptives = this.currentRaid.carriedCaptives;
        const currentDungeonCaptives = this.dungeonCaptives;

        if (currentDungeonCaptives.length + newCaptives.length > this.captiveCapacity) {
            
            this.logMessage('tribe', '你帶回的俘虜過多，地牢無法容納！你需要從現有和新增的俘虜中決定去留...', 'warning');

            this.openCaptiveManagementModal(
                'raid_return',
                [...currentDungeonCaptives, ...newCaptives],
                this.captiveCapacity
            );
        } else {
            this.endRaid(false);
        }
    },

    endRaid(wasDefeated = false) {
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
        
        // 恢復所有夥伴的生命值
        this.player.currentHp = this.player.maxHp;
        this.partners.forEach(p => p.currentHp = p.maxHp);
        this.logMessage('tribe', '所有夥伴的生命值都已完全恢復。', 'success');

        // nextDay() 內部已經包含了所有事件計算、排程和新生兒處理的邏輯
        this.nextDay();
    },

    checkRaidTime() {
        if (this.combat.isReinforcementBattle) {
            return;
        }

        if (this.currentRaid && this.currentRaid.timeRemaining <= 0) {
            if (this.screen === 'combat') {
                this.raidTimeExpired = true;
            } else if (!this.currentRaid.reinforcementsDefeated) {
                this.triggerReinforcementBattle();
            }
        }
    },

    executeSneakKidnapFromModal() {
        if (!this.modals.scoutInfo.target || !Array.isArray(this.modals.scoutInfo.target)) return;
        const group = this.modals.scoutInfo.target;
        const targetFemale = group.find(unit => unit.visual && unit.isAlive());

        if (targetFemale) {
            if (this.currentRaid.failedSneakTargets.has(targetFemale.id)) {
                this.showCustomAlert(`你已經對 ${targetFemale.name} 潛行失敗過一次，再次嘗試會被直接發現！`);
                return;
            }
            this.modals.scoutInfo.isOpen = false;
            this.selectedTarget = null;
            this.sneakKidnap(targetFemale, group);
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
                this.showCustomAlert(`你已經對 ${targetFemale.name} 所在的隊伍潛行失敗過，再次嘗試會被直接發現！`);
                this.startCombat(group, true);
                return;
            }
            this.selectedTarget = null;
            this.sneakKidnap(targetFemale, group);
        } else {
            this.showCustomAlert('該隊伍中沒有可下手的目標。');
        }
    },

    triggerReinforcementBattle() {
        if (!this.currentRaid || this.currentRaid.reinforcementsDefeated) {
            return;
        }
        this.logMessage('raid', '時間已到！王國騎士團的增援部隊抵達了城鎮！', 'enemy');
        const difficulty = this.currentRaid.difficulty;
        let knightSquad = [];
        const squadComposition = {
            easy:   { '士兵': 3, '盾兵': 2 },
            normal: { '士兵': 4, '盾兵': 3, '槍兵': 2, '弓兵': 1 },
            hard:   { '士兵': 5, '盾兵': 3, '槍兵': 3, '弓兵': 2, '騎士': 1, '法師': 1 },
            hell:   { '士兵': 6, '盾兵': 4, '槍兵': 4, '弓兵': 2, '騎士': 2, '法師': 1, '祭司': 1 }
        };
        const knightStatRanges = {
            easy: [65, 120], normal: [120, 190], hard: [190, 280], hell: [280, 360]
        };
        const composition = squadComposition[difficulty];
        const statRange = knightStatRanges[difficulty];

        if (composition) {
            for (const unitType in composition) {
                for (let i = 0; i < composition[unitType]; i++) {
                    const totalStatPoints = randomInt(statRange[0], statRange[1]);
                    let knight;
                    if (rollPercentage(50)) {
                        knight = new FemaleKnightOrderUnit(unitType, totalStatPoints);
                    } else {
                        knight = new KnightOrderUnit(unitType, totalStatPoints);
                    }
                    this.equipEnemy(knight, difficulty);
                    knightSquad.push(knight);
                }
            }
        }
        
        this.combat.isReinforcementBattle = true; 
        this.startCombat(knightSquad, true); 
    },

    async sneakKidnap(target, group) {
        const femalesInGroup = group.filter(unit => unit.visual && unit.isAlive());
        if (femalesInGroup.length === 0) {
            this.showCustomAlert('該隊伍中沒有可下手的目標。');
            return;
        }

        const primaryTarget = femalesInGroup[0];
        if (this.currentRaid.failedSneakTargets.has(primaryTarget.id)) {
            this.showCustomAlert(`你已經對 ${primaryTarget.name} 所在的隊伍潛行失敗過，再次嘗試會被直接發現！`);
            this.startCombat(group, true);
            return;
        }

        const playerParty = [this.player, ...this.player.party];
        const contestResult = this.performAbilityContest(playerParty, group);

        await this.showDiceRollAnimation('潛行擄走判定', 
            contestResult.partyA_Details.rolls.map(r => ({ sides: contestResult.partyA_Details.sides, result: r })), 
            contestResult.partyB_Details.rolls.map(r => ({ sides: contestResult.partyB_Details.sides, result: r }))
        );

        this.logMessage('raid', `我方潛行擲骰: ${contestResult.partyA_Value - contestResult.partyA_Details.partySize} + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('raid', `敵方警覺擲骰: ${contestResult.partyB_Value - contestResult.partyB_Details.partySize} + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');

        if (contestResult.partyA_Value > contestResult.partyB_Value) {
            this.currentRaid.timeRemaining -= 3;
            this.logMessage('raid', `潛行成功！你將 ${femalesInGroup.map(f => f.name).join('、')} 全部擄走！(-3 分鐘)`, 'success');
            femalesInGroup.forEach(femaleUnit => {
                const newCaptive = new FemaleHuman(femaleUnit.name, femaleUnit.stats, femaleUnit.profession, femaleUnit.visual, femaleUnit.originDifficulty);
                newCaptive.maxHp = newCaptive.calculateMaxHp();
                newCaptive.currentHp = newCaptive.maxHp;
                this.addCaptiveToCarry(newCaptive);
                this.gainResourcesFromEnemy(femaleUnit);
                this.removeUnitFromRaidZone(femaleUnit.id);
            });
            this.updateBuildingScoutText();
            this.checkRaidTime();
        } else {
            this.currentRaid.timeRemaining -= 6;
            femalesInGroup.forEach(f => this.currentRaid.failedSneakTargets.add(f.id));
            this.logMessage('raid', `潛行擄走 ${primaryTarget.name} 失敗，你被整個隊伍發現了！(-6 分鐘)`, 'enemy');
            this.startCombat(group, true);
            this.checkRaidTime();
        }
    },
};