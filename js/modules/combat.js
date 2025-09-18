// js/modules/combat.js

const combatModule = {
    // 啟動戰鬥
    startCombat(enemyGroup, enemyFirstStrike = false, alliesOverride = null) {
        this.resetAllSkillCooldowns();

        enemyGroup.forEach(enemy => {
            if (enemy instanceof ApostleMaiden || enemy instanceof SpiralGoddess) {
                enemy.triggeredDialogues = new Set();
            }
        });

        let combatAllies;

        if (!this.currentRaid) {
            const dispatchedIds = new Set([
                ...this.dispatch.hunting,
                ...this.dispatch.logging,
                ...this.dispatch.mining
            ]);
            const availablePartners = this.partners.filter(p => !dispatchedIds.has(p.id));
            combatAllies = [this.player, ...availablePartners];
            this.logMessage('tribe', `部落全員動員，抵禦入侵者！`, 'system');
        } else {
            combatAllies = [this.player, ...this.player.party];
        }

        this.combat.allies = (alliesOverride || combatAllies).filter(u => u.isAlive());
        this.combat.enemies = enemyGroup.filter(u => u.isAlive());
        this.combat.currentEnemyGroup = enemyGroup;
        this.combat.turn = 1;
        this.combat.isProcessing = false;
        this.combat.playerActionTaken = false;
        this.screen = 'combat';
        this.logs.combat = [];
        this.logMessage('combat', `戰鬥開始！`, 'system');
        
        if (enemyFirstStrike) {
            this.logMessage('combat', '敵人發動了突襲！', 'enemy');
            this.executeTurn(true); 
        } else {
            this.logMessage('combat', '等待你的指令...', 'system');
        }
    },

    async showDialogueWithAvatar(title, avatarUrl, content) {
        return new Promise(resolve => {
            const modal = this.modals.narrative;
            modal.isOpen = true;
            modal.title = title;
            modal.type = "tutorial"; // 重用教學模式的版面
            modal.isLoading = false;
            modal.isAwaitingConfirmation = false;
            modal.avatarUrl = avatarUrl;
            modal.content = `<p class="text-lg leading-relaxed">${content}</p>`;
            
            // 當玩家點擊確認按鈕時，關閉視窗並 resolve Promise
            modal.onConfirm = () => {
                modal.isOpen = false;
                modal.onConfirm = null; // 清理回呼
                setTimeout(resolve, 200); // 稍微延遲以確保動畫效果
            };
        });
    },

    // 結束戰鬥
    endCombat(victory) {
        // **【核心修改：步驟 A】在所有邏輯開始前，先處理所有戰敗單位**
        if (this.currentRaid) {
            // 1. 找出本次戰鬥中「所有」被擊敗的敵人 ID
            const allDefeatedEnemyIds = this.combat.enemies
                .filter(e => !e.isAlive())
                .map(e => e.id);

            // 2. 立刻將他們從地圖資料中移除
            if (allDefeatedEnemyIds.length > 0) {
                allDefeatedEnemyIds.forEach(id => this.removeUnitFromRaidZone(id));
            }
        }
    
        let specialBossDefeated = false;
        this.clearAllCombatStatusEffects();
        const wasApostleBattle = this.combat.currentEnemyGroup.some(e => e instanceof ApostleMaiden);
        if (wasApostleBattle) {
            specialBossDefeated = true;
            if (victory) {
                this.logMessage('tribe', `你成功擊敗了螺旋女神的使徒！`, 'success');
                const captiveApostle = new FemaleHuman(
                    '使徒 露娜',
                    { strength: 180, agility: 180, intelligence: 180, luck: 180, charisma: 120 },
                    '使徒',
                    SPECIAL_BOSSES.apostle_maiden.visual,
                    'hell'
                );
                this.captives.push(captiveApostle);
                this.logMessage('tribe', `使徒的分身 [露娜] 被你捕獲，出現在了地牢中！`, 'crit');
            } else {
                this.logMessage('tribe', `你在使徒的無限增殖面前倒下了...`, 'enemy');
                this.totalBreedingCount = 0;
                this.logMessage('tribe', `你對繁衍的渴望似乎減退了。 (總繁衍次數已重置)`, 'system');
            }
            if (!this.flags.defeatedApostle) {
                this.flags.defeatedApostle = true;
                this.logMessage('tribe', `你獲得了關鍵物品 [繁衍之證]！繁衍系技能樹已解鎖！`, 'system');
                this.finishCombatCleanup(true); 
            }
        }
        else if (this.combat.currentEnemyGroup.some(e => e instanceof SpiralGoddess)) {
            specialBossDefeated = true;
            if (victory) {
                this.logMessage('tribe', `你戰勝了神之試煉，證明了哥布林存在的價值！`, 'success');
                const captiveGoddess = new FemaleHuman(
                    '女神 露娜',
                    SPECIAL_BOSSES.spiral_goddess_mother.captiveFormStats,
                    '女神',
                    SPECIAL_BOSSES.spiral_goddess_mother.visual,
                    'hell'
                );
                this.captives.push(captiveGoddess);
                this.logMessage('tribe', `女神的分身 [露娜] 出現在了你的地牢中，她似乎失去了大部分的力量...`, 'crit');

                if (!this.flags.defeatedGoddess) {
                    this.flags.defeatedGoddess = true;
                    this.logMessage('tribe', `你獲得了關鍵物品 [螺旋的權能]！權能系被動技能已解鎖！`, 'system');
                }
                this.pendingDecisions.push({ type: 'crone_dialogue' });
                this.finishCombatCleanup(true);
            } else {
                this.logMessage('tribe', `你在絕對的神力面前化為了塵埃...`, 'enemy');
            }
        }
        else {
             // **【核心修改：步驟 B】現在可以安全地處理俘虜轉化，因為地圖物件已被移除**
            const defeatedFemales = this.combat.enemies.filter(e => e instanceof FemaleHuman && !e.isAlive());
            if (defeatedFemales.length > 0) {
                const newCaptives = defeatedFemales.map(enemy => {
                    enemy.currentHp = enemy.calculateMaxHp();
                    enemy.statusEffects = [];
                    return enemy;
                });

                if (this.currentRaid) {
                    this.currentRaid.carriedCaptives.push(...newCaptives);
                } else {
                    if ((this.captives.length + newCaptives.length) > this.captiveCapacity) {
                        this.logMessage('tribe', '地牢空間不足，需要決定俘虜的去留...', 'warning');
                        this.pendingDecisions.push({
                            type: 'dungeon',
                            list: [...this.captives, ...newCaptives],
                            limit: this.captiveCapacity,
                        });
                    } else {
                        this.captives.push(...newCaptives);
                        this.logMessage('tribe', `你成功俘虜了 ${newCaptives.length} 名來襲的敵人！`, 'success');
                    }
                }
            }
        }

        if (this.player && !this.player.isAlive()) {
            this.initiateRebirth();
            return;
        }

        if (victory && typeof this.combat.onVictoryCallback === 'function') {
            this.combat.onVictoryCallback();
        }

        if (!specialBossDefeated) {
            if (this.currentRaid && this.raidTimeExpired) {
                this.raidTimeExpired = false;
                if (victory) {
                    this.triggerReinforcementBattle();
                } else {
                    this.prepareToEndRaid(true);
                }
                if (this.postBattleBirths.length > 0) {
                    this.postBattleBirths.forEach(birth => {
                        this.pendingDecisions.push({
                            type: 'partner',
                            list: [...this.partners, birth.newborn],
                            limit: this.partnerCapacity,
                            context: { mother: birth.mother, newborn: birth.newborn }
                        });
                    });
                    this.postBattleBirths = [];
                    this.checkAndProcessDecisions();
                }
                return;
            }

            if (!this.currentRaid) {
                if (victory) {
                    this.logMessage('tribe', '你成功擊退了來襲的敵人！', 'success');
                } else {
                    this.logMessage('tribe', '你在部落保衛戰中失敗了！', 'enemy');
                    this.removeAllCaptives('rescued');
                }
                this.combat.isDlcEncounterBattle = false;
                this.finishCombatCleanup(true);
                return;
            }

            if (this.player && !this.player.isAlive()) {
                this.logMessage('tribe', '夥伴們獲得了勝利！牠們將倒下的哥布林王帶回了部落。', 'success');
            }

            if (this.combat.isReinforcementBattle) {
                if (this.isRetreatingWhenTimeExpired) {
                    this.logMessage('tribe', '你擊敗了前來阻截的騎士團，成功帶著戰利品返回部落！', 'success');
                    this.prepareToEndRaid(false);
                } else {
                    this.currentRaid.timeRemaining = Infinity;
                    this.currentRaid.reinforcementsDefeated = true;
                    this.logMessage('raid', '你擊敗了騎士團的增援部隊！時間壓力消失了，你可以繼續探索這座城鎮。', 'success');
                    this.finishCombatCleanup();
                }
                this.isRetreatingWhenTimeExpired = false;
            } else {
                if (this.currentRaid.carriedCaptives.length > this.carryCapacity) {
                    this.openCaptiveManagementModal('raid', this.currentRaid.carriedCaptives, this.carryCapacity);
                } else {
                    this.finishCombatCleanup();
                }
            }
        }
    },

    showCombatEnemyInfo() {
        const livingEnemies = this.combat.enemies.filter(e => e.isAlive());
        if (livingEnemies.length === 0) {
            this.showCustomAlert('戰場上已經沒有敵人了！');
            return;
        }

        const modal = this.modals.scoutInfo;
        modal.target = livingEnemies;
        modal.isCombatView = true; // 標記為戰鬥內查看
        modal.isOpen = true;
    },

    async executeTurn(isEnemyFirstStrike = false) {
        if (this.combat.isGoddessQnA) {
            this.combat.isProcessing = false;
            return;
        }
        if (this.combat.isProcessing) return;
        this.combat.isProcessing = true;

        if (this.combat.turn > 15) {
            const oldestTurnToKeep = this.combat.turn - 15;
            this.logs.combat = this.logs.combat.filter(entry => entry.turn >= oldestTurnToKeep);
        }
        
        if (this.currentRaid) {
            this.currentRaid.timeRemaining--;
            this.checkRaidTime();
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 (-1 分鐘) ---`, 'system');
        } else {
            this.logMessage('combat', `--- 第 ${this.combat.turn} 回合 ---`, 'system');
        }

        const livingEnemies = this.combat.enemies.filter(e => e.isAlive());
        for (const unit of livingEnemies) {
            if (!unit.isAlive()) continue;
            await this.processAiAction(unit);

            // 每次敵方行動後，檢查我方是否全滅
            if (this.combat.allies.filter(u => u.isAlive()).length === 0) {
                break;
            }
        }
        
        await new Promise(res => setTimeout(res, 200));

        if (!isEnemyFirstStrike) {
            const livingPartners = this.combat.allies.filter(p => p.id !== this.player.id && p.isAlive());
            for (const unit of livingPartners) {
                    if (!unit.isAlive()) continue;
                    await this.processAiAction(unit);

                    // 在每個夥伴行動後，都進行一次條件式延遲
                    await this.combatDelay(500);

                    // 每次我方夥伴行動後，檢查敵方是否全滅
                    if (this.combat.enemies.filter(e => e.isAlive()).length === 0) {
                        break;
                    }
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
            if (typeof this.combat.onVictoryCallback === 'function') {
                this.combat.onVictoryCallback();
            }
            this.endCombat(true);
        } else {
            this.combat.turn++;
            this.combat.isProcessing = false;
            if (!this.player.isAlive()) {
                this.logMessage('combat', '哥布林王倒下了！夥伴們將繼續戰鬥！', 'system');
                setTimeout(() => this.executeTurn(false), 1500);
            } else {
                this.combat.playerActionTaken = false;
                this.logMessage('combat', '等待你的指令...', 'system');
            }
        }
    },
        
    async processAiAction(attacker) {
        // 使用 do-while 迴圈來處理額外行動
        let hasActedOnce = false;
        do {
            // 如果這不是第一次行動（即為額外行動）
            if (hasActedOnce) {
                this.logMessage('combat', `${attacker.name} 觸發了 [超越]，獲得了額外行動！`, 'skill');
                // 為攻擊者單獨減少技能冷卻
                if (attacker.skills && attacker.skills.length > 0) {
                    attacker.skills.forEach(skill => {
                        if (skill.currentCooldown > 0) {
                            skill.currentCooldown--;
                        }
                    });
                }
                await new Promise(res => setTimeout(res, 300));
            }

            // --- 每次行動前，先確認是否有可攻擊的目標 ---
            const isCurrentAttackerAlly = this.combat.allies.some(a => a.id === attacker.id);
            const currentEnemies = isCurrentAttackerAlly 
                ? this.combat.enemies.filter(u => u.isAlive()) 
                : this.combat.allies.filter(u => u.isAlive());

            if (currentEnemies.length === 0) {
                break; // 如果沒有目標，直接跳出本次及所有額外行動
            }

            // 邏輯 1: 超越世紀的惡魔
            if (attacker.name === '超越世紀的惡魔') {
                const torrentSkill = attacker.skills.find(s => s.id === 'century_torrent');
                if (torrentSkill && torrentSkill.currentCooldown === 0) {
                    await this.executeSkill(torrentSkill, attacker, this.combat.allies, currentEnemies);
                } else {
                    const target = currentEnemies[randomInt(0, currentEnemies.length - 1)];
                    await this.processAttack(attacker, target, false);
                }
            }
            // 邏輯 2: 螺旋女神
            else if (attacker instanceof SpiralGoddess) {
                if (attacker.phase === 1) {
                    if (attacker.qnaIndex === 0 && !attacker.phase1_dialogue_shown) {
                        await this.showDialogueWithAvatar(attacker.name, 'assets/goddess_avatar.png', SPECIAL_BOSSES.spiral_goddess_mother.dialogues.phase1_start);
                        attacker.phase1_dialogue_shown = true; // 增加一個旗標，確保對話只說一次
                    }
    
                    const result = await this.promptGoddessQuestionAndWaitForAnswer();
                    if (!result.finished) {
                        const playerNumericAnswer = parseInt(result.answer.trim());
                        const qnaData = SPECIAL_BOSSES.spiral_goddess_mother.qna;
                        const currentQnA = qnaData[attacker.qnaIndex];
                        let correctAnswer;
                        switch (currentQnA.check) {
                            case 'playerHeight': correctAnswer = this.player.height; break;
                            case 'partnerCount': correctAnswer = this.partners.length; break;
                            case 'penisSize':   correctAnswer = this.player.penisSize; break;
                            case 'captiveCount': correctAnswer = this.captives.length; break;
                            default: correctAnswer = -999; break;
                        }
                        if (!isNaN(playerNumericAnswer) && playerNumericAnswer === correctAnswer) {
                            this.logMessage('combat', `你回答了：「${playerNumericAnswer}」。女神點了點頭。`, 'player');
                        } else {
                            const penaltyDamage = correctAnswer * 10;
                            await this.showCustomAlert(
                                `女神：「謊言...是沒有意義的。」`,
                                async () => {
                                    this.logMessage('combat', `你回答了：「${playerNumericAnswer || '無效的回答'}」。女神對你的謊言降下懲罰！(正確答案: ${correctAnswer})`, 'enemy');
                                    await this.processAttack(attacker, this.player, false, penaltyDamage);
                                }
                            );
                        }
                        attacker.qnaIndex++;
                    }
                    if (attacker.qnaIndex >= SPECIAL_BOSSES.spiral_goddess_mother.qna.length && !attacker.phase2_triggered) {
                        attacker.phase2_triggered = true; attacker.phase = 2; 
                        this.showInBattleDialogue(attacker, 'phase2_start');
                        this.logMessage('combat', '問答的試煉結束了...女神的氣息改變了！', 'system');
                        this.combat.allies.forEach(ally => {
                            ally.statusEffects.push({ type: 'root_debuff', duration: Infinity });
                            ally.updateHp(this.isStarving); 
                        });
                        this.logMessage('combat', '我方全體感受到了靈魂深處的撕裂，生命力的根源被削弱了！', 'player');
                    }
                } else if (attacker.phase === 2) {
                    const target = currentEnemies[0];
                    if (target) await this.processAttack(attacker, target);
                } else if (attacker.phase >= 3) {
                    const repulsionSkillData = SPECIAL_BOSSES.spiral_goddess_mother.skills.find(s => s.id === 'goddess_repulsion');
                    let skillToUse = attacker.skills.find(s => s.id === 'goddess_repulsion');
                    if (!skillToUse) {
                        skillToUse = { ...repulsionSkillData, currentCooldown: 0 };
                        attacker.skills.push(skillToUse);
                    }
                    if (skillToUse.currentCooldown === 0) {
                        this.logMessage('combat', `女神施放了 <span class="text-pink-400">[${skillToUse.name}]</span>！`, 'skill');
                        skillToUse.currentCooldown = skillToUse.baseCooldown;
                        for (const ally of this.combat.allies.filter(a => a.isAlive())) {
                            const charismaDamage = ally.getTotalStat('charisma', this.isStarving);
                            ally.currentHp = Math.max(0, ally.currentHp - charismaDamage);
                            this.logMessage('combat', `奇異的力量在你體內奔流，對 ${ally.name} 造成了 ${charismaDamage} 點真實傷害！`, 'player');
                        }
                    } else {
                        const target = currentEnemies[0];
                        if (target) await this.processAttack(attacker, target);
                    }
                }
            }
            // 邏輯 3: 使徒
            else if (attacker instanceof ApostleMaiden) {
                const proliferateSkill = attacker.skills.find(s => s.id === 'apostle_proliferate');
                const apostleCount = this.combat.enemies.filter(e => e.profession === '使徒').length;
                if (proliferateSkill && proliferateSkill.currentCooldown === 0 && apostleCount < 20) {
                    await this.executeSkill(proliferateSkill, attacker, this.combat.enemies, currentEnemies);
                } else {
                    const target = currentEnemies[randomInt(0, currentEnemies.length - 1)];
                    await this.processAttack(attacker, target, false);
                }
            }
            // 邏輯 4: 其他所有通用單位 (騎士、哥布林夥伴等)
            else {
                let actionTaken = false;
                // 優先使用技能
                if (attacker.skills && attacker.skills.length > 0) {
                    // 尋找第一個冷卻完畢的技能，而不只是第一個
                    const skill = attacker.skills.find(s => s.currentCooldown === 0);
                    if (skill) { // 如果找到了可用的技能
                        let shouldUseSkill = false;
                        if (skill.type === 'team_heal') {
                            const allies = isCurrentAttackerAlly ? this.combat.allies.filter(u => u.isAlive()) : this.combat.enemies.filter(u => u.isAlive());
                            const totalMaxHp = allies.reduce((sum, a) => sum + a.maxHp, 0);
                            const totalCurrentHp = allies.reduce((sum, a) => sum + a.currentHp, 0);
                            if ((totalCurrentHp / totalMaxHp) < skill.triggerHp) {
                                shouldUseSkill = true;
                            }
                        } else if (skill.type === 'charge_nuke') {
                            if (!attacker.statusEffects.some(e => e.type === 'charge_nuke')) {
                                shouldUseSkill = true;
                            }
                        } else {
                            if (!attacker.statusEffects.some(e => e.type === skill.type)) {
                                shouldUseSkill = true;
                            }
                        }
                        if (shouldUseSkill) {
                            await this.executeSkill(skill, attacker, this.combat.allies, currentEnemies);
                            actionTaken = true;
                        }
                    }
                }
                // 處理詠唱中的技能
                const chargingEffect = attacker.statusEffects.find(e => e.type === 'charge_nuke');
                if (chargingEffect) {
                    if (chargingEffect.chargeTurns <= 0) {
                        this.logMessage('combat', `[${attacker.name}] 的 [破滅法陣] 詠唱完畢！`, 'skill');
                        const damage = Math.floor(attacker.getTotalStat('intelligence') * chargingEffect.multiplier);
                        for (const target of currentEnemies) {
                            target.currentHp = Math.max(0, target.currentHp - damage);
                            this.logMessage('combat', `法陣衝擊了 ${target.name}，造成 ${damage} 點無法閃避的傷害。`, 'enemy');
                            if (!target.isAlive()) this.logMessage('combat', `${target.name} 被擊敗了！`, 'system');
                        }
                        attacker.statusEffects = attacker.statusEffects.filter(e => e.type !== 'charge_nuke');
                    } else {
                        this.logMessage('combat', `${attacker.name} 正在詠唱... (剩餘 ${chargingEffect.chargeTurns} 回合)`, 'info');
                    }
                    actionTaken = true;
                }
                // 如果沒做任何事，就普通攻擊
                if (!actionTaken) {
                    const target = currentEnemies[randomInt(0, currentEnemies.length - 1)];
                    await this.processAttack(attacker, target, false);
                }
            }

            // --- 迴圈控制 ---
            hasActedOnce = true;
            if (attacker.extraActions > 0) {
                attacker.extraActions--;
            }
        
        // 如果還有額外行動，並且場上還有敵人，就繼續迴圈
        } while ((attacker.extraActions || 0) > 0 && this.combat.enemies.filter(e => e.isAlive()).length > 0);
    },

    async processAttack(attacker, target, isExtraAttack = false, overrideDamage = null) {
        const isAllyAttacking = this.combat.allies.some(a => a.id === attacker.id);
        const logType = isAllyAttacking ? 'player' : 'enemy';
        const enemyTeam = isAllyAttacking ? this.combat.enemies : this.combat.allies;
        let currentTarget = target;

        const taunter = enemyTeam.find(e => e.statusEffects.some(s => s.type === 'taunt'));
        if (taunter && taunter.id !== currentTarget.id && taunter.isAlive()) {
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${taunter.name} 吸引了！`, 'info');
            currentTarget = taunter;
        }

        const weapon = attacker.equipment.mainHand;
        const weaponType = weapon ? weapon.baseName : '徒手';
        if (!isExtraAttack) {
            this.logMessage('combat', `${attacker.name} 使用 [${weaponType}] 攻擊 ${currentTarget.name}！`, logType);
        }

        let attackerDiceCount = 0;
        let defenderDiceCount = 0;

        if (weaponType === '徒手') {
            let attackerStatsToAverage = ['strength', 'agility', 'intelligence', 'luck'];
            if (attacker.visual) {
                attackerStatsToAverage.push('charisma');
            }
            const attackerAvgStat = attacker.getAverageStat(attackerStatsToAverage, this.isStarving, this);
            attackerDiceCount = Math.max(1, Math.floor(attackerAvgStat / 20 / 2));
            
            const defenderWeapon = currentTarget.equipment.mainHand;
            if (defenderWeapon) {
                const defenderWeaponType = defenderWeapon.baseName;
                let defenderStat;
                switch (defenderWeaponType) {
                    case '短刀': case '彎刀': case '爪': case '斧頭': case '投石索':
                        defenderStat = currentTarget.getAverageStat(['strength', 'agility'], this.isStarving, this);
                        break;
                    default:
                        const singleStatMap = { '劍': 'strength', '雙手劍': 'strength', '長槍': 'luck', '弓': 'agility', '法杖': 'intelligence' };
                        defenderStat = currentTarget.getTotalStat(singleStatMap[defenderWeaponType] || 'strength', this.isStarving, this);
                        break;
                }
                defenderDiceCount = Math.max(1, Math.floor(defenderStat / 20));
            } else {
                let defenderStatsToAverage = ['strength', 'agility', 'intelligence', 'luck'];
                if (currentTarget.visual) {
                    defenderStatsToAverage.push('charisma');
                }
                const defenderAvgStat = currentTarget.getAverageStat(defenderStatsToAverage, this.isStarving, this);
                defenderDiceCount = Math.max(1, Math.floor(defenderAvgStat / 20 / 2));
            }
        } 
        else {
            let attackerStatValue = 0;
            let defenderStatValue = 0;
            switch (weaponType) {
                case '短刀':
                    attackerStatValue = attacker.getAverageStat(['agility', 'intelligence'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['agility', 'intelligence'], this.isStarving, this);
                    break;
                case '拐棍':
                    attackerStatValue = attacker.getAverageStat(['strength', 'intelligence'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['strength', 'intelligence'], this.isStarving, this);
                    break;
                case '彎刀':
                    attackerStatValue = attacker.getAverageStat(['strength', 'agility'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['strength', 'agility'], this.isStarving, this);
                    break;
                case '長鞭':
                    attackerStatValue = attacker.getAverageStat(['intelligence', 'luck'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['intelligence', 'luck'], this.isStarving, this);
                    break;
                case '爪':
                    attackerStatValue = attacker.getAverageStat(['agility', 'luck'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['agility', 'luck'], this.isStarving, this);
                    break;
                case '斧頭':
                    attackerStatValue = attacker.getAverageStat(['strength', 'luck'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['strength', 'luck'], this.isStarving, this);
                    break;
                case '投石索':
                    attackerStatValue = attacker.getAverageStat(['agility', 'intelligence', 'luck'], this.isStarving, this);
                    defenderStatValue = currentTarget.getAverageStat(['agility', 'intelligence', 'luck'], this.isStarving, this);
                    break;
                default:
                    const singleStatMap = { '劍': 'strength', '雙手劍': 'strength', '長槍': 'luck', '弓': 'agility', '法杖': 'intelligence' };
                    const judgementStat = singleStatMap[weaponType] || 'strength';
                    attackerStatValue = attacker.getTotalStat(judgementStat, this.isStarving, this);
                    defenderStatValue = currentTarget.getTotalStat(judgementStat, this.isStarving, this);
                    break;
            }
            attackerDiceCount = Math.max(1, Math.floor(attackerStatValue / 20));
            defenderDiceCount = Math.max(1, Math.floor(defenderStatValue / 20));
        }

        // --- 命中計算採用新的動態加成 ---
        const attackerQualityBonus = attacker.equipment.mainHand?.qualityBonus || 0;
        const attackerRoll = rollDice(`${attackerDiceCount}d20`);
        const dynamicAttackerBonus = attackerQualityBonus * attackerDiceCount; // 品質加成 * 擲骰數
        const attackerTotal = attackerRoll.total + dynamicAttackerBonus;

        const defenderArmorBonus = currentTarget.equipment.chest?.qualityBonus || 0;
        let defenderShieldBonus = 0; // 預設盾牌品質加成為 0

        // 只有在防守方「裝備了主手武器」的情況下，副手盾牌的品質加成才生效
        if (currentTarget.equipment.mainHand && currentTarget.equipment.offHand?.baseName === '盾') {
            defenderShieldBonus = currentTarget.equipment.offHand.qualityBonus || 0;
        }
        
        const defenderRoll = rollDice(`${defenderDiceCount}d20`);
        const dynamicDefenderBonus = (defenderArmorBonus * defenderDiceCount) + (defenderShieldBonus * defenderDiceCount); // 防具的品質加成同樣乘以擲骰數
        const defenderTotal = defenderRoll.total + dynamicDefenderBonus;

        if (attacker.id === this.player.id || currentTarget.id === this.player.id) {
            const isAllyAttacking = this.combat.allies.some(a => a.id === attacker.id);
            let playerSideRolls = isAllyAttacking ? attackerRoll : defenderRoll;
            let enemySideRolls = isAllyAttacking ? defenderRoll : attackerRoll;
            const animationTitle = isAllyAttacking ? '攻擊判定' : '迴避判定';
            await this.showDiceRollAnimation(animationTitle, 
                playerSideRolls.rolls.map(r => ({ sides: playerSideRolls.sides, result: r })), 
                enemySideRolls.rolls.map(r => ({ sides: enemySideRolls.sides, result: r }))
            );
        }
        
        this.logMessage('combat', `> 攻擊方 (擲 ${attackerDiceCount}d20): ${attackerRoll.total}(擲骰) + ${dynamicAttackerBonus}(品質加成) = ${attackerTotal}`, 'info');
        this.logMessage('combat', `> 防守方 (擲 ${defenderDiceCount}d20): ${defenderRoll.total}(擲骰) + ${dynamicDefenderBonus}(品質加成) = ${defenderTotal}`, 'info');

        if (attackerTotal <= defenderTotal) { 
            this.logMessage('combat', `${attacker.name} 的攻擊被 ${currentTarget.name} 閃過了！`, logType === 'player' ? 'enemy' : 'player');
            showFloatingText(currentTarget.id, 'MISS', 'miss');
            return false;
        }
        
        this.logMessage('combat', `攻擊命中！`, 'success');

        // --- 傷害計算加入新的浮動傷害 ---
        let baseDamage;
        let floatingDamage = 0; // 初始化浮動傷害為 0

        if (overrideDamage !== null) {
            // 如果是技能傷害，則直接使用技能傷害值，不計算浮動傷害
            baseDamage = overrideDamage;
        } else {
            // 如果是普通攻擊，先計算基礎傷害
            baseDamage = attacker.calculateDamage(this.isStarving);
            
            // 如果武器品質加成 > 0，則計算浮動傷害
            if (attackerQualityBonus > 0) {
                const damageRoll = rollDice(`${attackerDiceCount}d20`);
                floatingDamage = attackerQualityBonus * damageRoll.total;
                this.logMessage('combat', `> 品質加成造成了浮動傷害: ${attackerQualityBonus}(品質) × ${damageRoll.total}(擲骰) = ${floatingDamage} 點`, 'crit');
            }
        }

        let damage = baseDamage + floatingDamage;

        let attackerGamblerBonus = 0;
        let critAffixCount = 0;
        let penetratingAffixCount = 0;
        let devastatingAffixCount = 0;

        Object.values(attacker.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.key === 'gambler' && affix.effects) attackerGamblerBonus += affix.effects.value;
                if (affix.key === 'critical_strike') critAffixCount++;
                if (affix.key === 'penetrating') penetratingAffixCount++;
                if (affix.key === 'devastating') devastatingAffixCount++;
            });
        });

        const totalCritChance = 5.0 + (critAffixCount * 10) + attackerGamblerBonus;
        if (rollPercentage(totalCritChance)) {
            this.logMessage('combat', `致命一擊！`, 'crit');
            const baseCritMultiplier = 1.5;
            let baseCritDamage = Math.floor(damage * baseCritMultiplier);
            if (devastatingAffixCount > 0) {
                const devastatingAffixData = STANDARD_AFFIXES.devastating;
                const bonusPerAffix = devastatingAffixData.effects.crit_damage_bonus;
                const bonusDamage = Math.floor((damage * baseCritMultiplier * bonusPerAffix) * devastatingAffixCount);
                this.logMessage('combat', `[毀滅的] 效果觸發 x${devastatingAffixCount}，額外造成 ${bonusDamage} 點爆擊傷害！`, 'skill');
                damage = baseCritDamage + bonusDamage;
            } else {
                damage = baseCritDamage;
            }
        }

        let penetrationEffect = 0;
        if (penetratingAffixCount > 0) {
            const totalPenetratingChance = (penetratingAffixCount * 10) + attackerGamblerBonus;
            if (rollPercentage(totalPenetratingChance)) {
                const affixInstance = Object.values(attacker.equipment).flatMap(i => i ? i.affixes : []).find(a => a.key === 'penetrating');
                if (affixInstance) {
                    penetrationEffect = affixInstance.procInfo.value;
                    this.logMessage('combat', `${attacker.name} 的 [穿透的] 詞綴發動，削弱了目標的防禦！`, 'skill');
                }
            }
        }

        const armor = currentTarget.equipment.chest;
        if (armor && armor.stats.damageReduction) {
            const effectiveReduction = armor.stats.damageReduction * (1 - penetrationEffect);
            damage = Math.floor(damage * (1 - effectiveReduction / 100));
            this.logMessage('combat', `> ${currentTarget.name} 的 ${armor.baseName} 減免了 ${effectiveReduction.toFixed(1)}% 的傷害。`, 'info');
        }
        
        let defenderGamblerBonus = 0;
        let blockingAffixCount = 0;
        Object.values(currentTarget.equipment).forEach(item => {
            if (!item) return;
            item.affixes.forEach(affix => {
                if (affix.key === 'gambler') defenderGamblerBonus += affix.effects.value;
                if (affix.key === 'blocking') blockingAffixCount++;
            });
        });
        
        let wasBlockedByAffix = false;
        if (blockingAffixCount > 0) {
            const totalBlockingChance = (blockingAffixCount * 5) + defenderGamblerBonus;
            if (rollPercentage(totalBlockingChance)) {
                damage = 0; wasBlockedByAffix = true;
                this.logMessage('combat', `${currentTarget.name} 的 [格擋的] 詞綴發動，完全格擋了本次傷害！`, 'skill');
            }
        }

        const shield = currentTarget.equipment.offHand;
        if (!wasBlockedByAffix && shield && shield.baseName === '盾') {
            const baseBlockChance = (20 - (shield.stats.blockTarget || 20)) * 5;
            const finalBlockChance = baseBlockChance + defenderGamblerBonus;
            this.logMessage('combat', `> ${currentTarget.name} 進行盾牌格擋: 機率 ${finalBlockChance.toFixed(1)}%`, 'info');
            if (rollPercentage(finalBlockChance)) {
                damage = Math.floor(damage * 0.75);
                this.logMessage('combat', `${currentTarget.name} 的盾牌成功格擋了攻擊，傷害大幅降低！`, 'skill');
            }
        }

        let finalDamage = Math.max(0, Math.floor(damage)); 
        if (currentTarget.profession === '使徒' && finalDamage > 0 && rollPercentage(25)) {
            const nullifySkill = currentTarget.skills.find(s => s.id === 'apostle_nullify');
            if (nullifySkill) {
                const healAmount = Math.floor(finalDamage * 0.5);
                currentTarget.currentHp = Math.min(currentTarget.maxHp, currentTarget.currentHp + healAmount);
                this.logMessage('combat', `${currentTarget.name} 的 [歸零的權能] 觸發！傷害變為0，並恢復了 ${healAmount} 點生命！`, 'crit');
                finalDamage = 0;
            }
        }

        // 處理共生關係的傷害分攤邏輯
        const isTargetAlly = this.combat.allies.some(a => a.id === currentTarget.id);
        const symbiosisEffect = currentTarget.statusEffects.find(e => e.type === 'symbiosis');

        if (isTargetAlly && symbiosisEffect) {
            const livingAllies = this.combat.allies.filter(a => a.isAlive());
            if (livingAllies.length > 0) {
                // 1. 套用技能的傷害減免
                const reducedDamage = Math.floor(finalDamage * (1 - symbiosisEffect.damageReduction));
                // 2. 計算每個單位需要分攤的傷害
                const sharedDamage = Math.max(1, Math.floor(reducedDamage / livingAllies.length));

                this.logMessage('combat', `[共生關係] 觸發！原傷害 ${finalDamage} 點，減免後為 ${reducedDamage} 點，由 ${livingAllies.length} 名成員共同分攤！`, 'skill');

                // 3. 對所有存活的我方單位造成分攤後的傷害
                livingAllies.forEach(ally => {
                    ally.currentHp = Math.max(0, ally.currentHp - sharedDamage);
                    this.logMessage('combat', `${ally.name} 分攤了 ${sharedDamage} 點傷害。`, 'player');
                    showFloatingText(ally.id, sharedDamage, 'damage');
                    if (!ally.isAlive()) {
                        this.logMessage('combat', `${ally.name} 被擊敗了！`, 'system');
                        if (ally.id !== this.player.id) this.handlePartnerDeath(ally.id);
                    }
                });

                // 4. 結束函式，避免執行後續的單體傷害邏輯
                return true;
            }
        }

        currentTarget.currentHp = Math.max(0, currentTarget.currentHp - finalDamage);
        this.logMessage('combat', `${attacker.name} 對 ${currentTarget.name} 造成了 ${finalDamage} 點傷害。`, isAllyAttacking ? 'player' : 'enemy');

        const hpPercent = currentTarget.currentHp / currentTarget.maxHp;
        if (currentTarget instanceof ApostleMaiden && currentTarget.isAlive()) {
            if (hpPercent <= 0.25 && currentTarget.triggeredDialogues && !currentTarget.triggeredDialogues.has('hp_25')) this.showInBattleDialogue(currentTarget, 'hp_25');
            else if (hpPercent <= 0.50 && currentTarget.triggeredDialogues && !currentTarget.triggeredDialogues.has('hp_50')) this.showInBattleDialogue(currentTarget, 'hp_50');
            else if (hpPercent <= 0.75 && currentTarget.triggeredDialogues && !currentTarget.triggeredDialogues.has('hp_75')) this.showInBattleDialogue(currentTarget, 'hp_75');
        }

        if (currentTarget.id === this.player.id && attacker instanceof ApostleMaiden) {
            if (hpPercent <= 0.50 && attacker.triggeredDialogues && !attacker.triggeredDialogues.has('player_hp_50')) this.showInBattleDialogue(attacker, 'player_hp_50');
        }

        if (currentTarget instanceof SpiralGoddess) {
            const hpPercent = currentTarget.currentHp / currentTarget.maxHp;
            if (currentTarget.phase === 2 && !currentTarget.phase3_triggered && hpPercent <= 0.75) {
                currentTarget.phase3_triggered = true;
                currentTarget.phase = 3; // 【修正】此處應為 currentTarget.phase = 3
                this.showInBattleDialogue(currentTarget, 'phase3_start'); // 【修改】使用彈出對話
                this.combat.allies.forEach(ally => {
                    ally.statusEffects.push({ type: 'feminized', duration: Infinity });
                    ally.updateHp(this.isStarving); 
                });
                this.logMessage('combat', '一陣奇異的光芒籠罩了我方全體，身體的構造似乎發生了不可逆的變化！', 'player');
            }
            if (currentTarget.phase === 3 && !currentTarget.phase4_triggered && hpPercent <= 0.50) {
                currentTarget.phase4_triggered = true;
                currentTarget.phase = 4;
                this.showInBattleDialogue(currentTarget, 'phase4_start');
                const charismaValue = currentTarget.stats.charisma;
                const bonusPerStat = Math.floor(charismaValue / 4);
                currentTarget.stats.strength += bonusPerStat;
                currentTarget.stats.agility += bonusPerStat;
                currentTarget.stats.intelligence += bonusPerStat;
                currentTarget.stats.luck += bonusPerStat;
                currentTarget.stats.charisma = 0;
                this.logMessage('combat', '女神捨棄了魅力，將其轉化為純粹的力量！', 'system');
            }
            else if (currentTarget.phase === 4 && !currentTarget.phase5_triggered && hpPercent <= 0.25) {
                currentTarget.phase5_triggered = true;
                currentTarget.phase = 5;
                this.showInBattleDialogue(currentTarget, 'phase5_start');

                // --- 1. 女神解除自身 Buff ---
                this.logMessage('combat', '女神捨棄了力量，將其轉化為純粹的魅力以召喚她的僕從！', 'system');
                currentTarget.stats = { ...SPECIAL_BOSSES.spiral_goddess_mother.stats }; // 恢復原始屬性

                const goddessBuff = Math.floor(2902 / 10 / 5); // 計算 +58 的強化值

                // --- 2. 決定召喚名單 (含優先序) ---
                let captivesToSummon = [];
                const remainingCaptives = [...this.captives];

                // 優先尋找特殊單位
                const centuryIndex = remainingCaptives.findIndex(c => c.name === '世紀的分身');
                if (centuryIndex > -1) {
                    captivesToSummon.push(remainingCaptives.splice(centuryIndex, 1)[0]);
                }
                const apostleIndex = remainingCaptives.findIndex(c => c.name === '使徒 露娜');
                if (apostleIndex > -1) {
                    captivesToSummon.push(remainingCaptives.splice(apostleIndex, 1)[0]);
                }

                // 隨機補齊剩餘空位
                remainingCaptives.sort(() => 0.5 - Math.random());
                const slotsToFill = 20 - captivesToSummon.length;
                if (slotsToFill > 0) {
                    captivesToSummon.push(...remainingCaptives.slice(0, slotsToFill));
                }

                if (captivesToSummon.length > 0) {
                    let summonedEnemies = [];
                    let newAllies = [];
                    let dialogueEvents = [];

                    // --- 3. 執行召喚與強化 ---
                    captivesToSummon.forEach(c => {
                        let summoned;
                        // 特殊處理：世紀的分身
                        if (c.name === '世紀的分身') {
                            summoned = new FemaleHuman(c.name, c.stats, c.profession, c.visual);
                            Object.assign(summoned, JSON.parse(JSON.stringify(c)));
                            summoned.name = '超越世紀的惡魔';
                            summoned.id = crypto.randomUUID();
                            // 先進行自身的 *10 強化
                            Object.keys(summoned.stats).forEach(stat => {
                                summoned.stats[stat] *= 10;
                            });
                            // 再加上女神的 +58 Buff
                            Object.keys(summoned.stats).forEach(stat => {
                                summoned.stats[stat] += goddessBuff;
                            });
                            const totalStats = Object.values(summoned.stats).reduce((a, b) => a + b, 0);
                            summoned.maxHp = Math.floor(totalStats * 7.3577);
                            summoned.currentHp = summoned.maxHp;
                            summoned.skills = [{ id: 'century_torrent', name: '世紀的洪流', type: 'custom_aoe_5stat', baseCooldown: 8, currentCooldown: 0, hasBeenUsed: false, firstUseDialogue: '世紀「哎呀~老熟人了~這應該算是一種售後服務吧？」' }];
                            newAllies.push(summoned);
                            return;
                        }
                        // 特殊處理：使徒 露娜
                        else if (c.name === '使徒 露娜') {
                            apostleIsPresent = true;
                            summoned = new ApostleMaiden(this.combat);
                            summoned.id = crypto.randomUUID();
                        }
                        // 一般俘虜
                        else {
                            const captiveData = JSON.parse(JSON.stringify(c));
                            if (Object.keys(KNIGHT_ORDER_UNITS).includes(captiveData.profession)) {
                                summoned = new FemaleKnightOrderUnit(captiveData.profession, 0);
                            } else {
                                summoned = new FemaleHuman(captiveData.name, {}, captiveData.profession, captiveData.visual, captiveData.originDifficulty, captiveData.race);
                            }
                            Object.assign(summoned, captiveData);
                            summoned.id = crypto.randomUUID();
                        }

                        // 為所有召喚的敵人加上女神的 +58 Buff
                        Object.keys(summoned.stats).forEach(stat => {
                            summoned.stats[stat] += goddessBuff;
                        });
                        summoned.updateHp(this.isStarving); // 使用 updateHp 來觸發正確的血量計算
                        summonedEnemies.push(summoned);
                    });

                    // --- 4. 處理戰場與對話 ---
                    if (summonedEnemies.length > 0) this.combat.enemies.push(...summonedEnemies);
                    if (newAllies.length > 0) this.combat.allies.push(...newAllies);
                    this.logMessage('combat', `你過去擄來的 ${captivesToSummon.length} 名女性出現在戰場上，她們的能力被大幅強化了！`, 'enemy');
                    if (newAllies.length > 0) this.logMessage('combat', `但 ${newAllies.map(a => a.name).join(',')} 似乎不受女神的控制...`, 'success');

                    // --- 觸發特殊對話 ---
                    if (apostleIsPresent) {
                         dialogueEvents.push({ speaker: '女神', content: '「真沒想到，居然還需要我這樣救妳出來?」' });
                         dialogueEvents.push({ speaker: '使徒', content: '「哼！誰要妳救了！而且會使用這招，代表妳不也快到絕路了嗎？我可悲慈愛的半身...還在手下留情？」' });
                    }
                    if (centuryIsPresent) {
                        dialogueEvents.push({ speaker: '世紀', content: '「沒想到以這種形式見面呢~」' });
                        dialogueEvents.push({ speaker: '女神', content: '「可惡的惡魔...居然在這種地方...」' });
                        dialogueEvents.push({ speaker: '世紀', content: '「我可沒想到我還能獲得增益喔，呵呵...」' });
                        if (apostleIsPresent) {
                            dialogueEvents.push({ speaker: '使徒', content: '「是妳這不屬於任何世界的傢伙嗎...」' });
                            dialogueEvents.push({ speaker: '世紀', content: '「誒！飛機場！不要說得我好像無家可歸好嗎？」' });
                            dialogueEvents.push({ speaker: '使徒', content: '「蛤？！妳說什麼？！妳給我過來！」' });
                        }
                    }

                    // 順序播放對話
                    (async () => {
                    // 定義每個說話者的頭像路徑
                    const speakerAvatars = {
                        '女神': 'assets/goddess_avatar.png',
                        '使徒': 'assets/apostle_avatar.png',
                        '世紀': 'assets/century_transcended_avatar.png' // 這是您提到的世紀新頭像
                    };

                    for (const event of dialogueEvents) {
                        const avatar = speakerAvatars[event.speaker] || 'assets/default_avatar.png';
                        await this.showDialogueWithAvatar(event.speaker, avatar, event.content);
                    }
                })();
                }
            }
        }
        
        if (finalDamage >= 0) {
            showFloatingText(currentTarget.id, finalDamage, 'damage');
        }
        
        if (attacker.isAlive()) {
            let vampiricAffixCount = 0;
            Object.values(attacker.equipment).forEach(item => {
                if(item && item.affixes.some(a => a.key === 'vampiric')) vampiricAffixCount++;
            });
            if (vampiricAffixCount > 0) {
                const totalVampiricChance = (vampiricAffixCount * 10) + attackerGamblerBonus;
                if(rollPercentage(totalVampiricChance)) {
                    const healAmount = Math.floor(finalDamage * 0.5);
                    attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
                    this.logMessage('combat', `${attacker.name} 的 [吸血的] 詞綴發動，恢復了 ${healAmount} 點生命。`, 'skill');
                }
            }
        }
        if (currentTarget.isAlive()) {
            let spikyAffixCount = 0;
            Object.values(currentTarget.equipment).forEach(item => {
                if (item && item.affixes.some(a => a.key === 'spiky')) spikyAffixCount++;
            });
            if (spikyAffixCount > 0) {
                const totalSpikyChance = (spikyAffixCount * 10) + defenderGamblerBonus;
                if (rollPercentage(totalSpikyChance)) {
                    const thornsDamage = Math.floor(finalDamage * 0.1);
                    if(thornsDamage > 0) {
                         attacker.currentHp = Math.max(0, attacker.currentHp - thornsDamage);
                         this.logMessage('combat', `${currentTarget.name} 的 [尖刺的] 詞綴發動，對 ${attacker.name} 反彈了 ${thornsDamage} 點傷害！`, 'skill');
                    }
                }
            }
        }
        if (!isExtraAttack && attacker.isAlive() && currentTarget.isAlive()) {
            let multiHitAffixCount = 0;
            Object.values(attacker.equipment).forEach(item => {
                if(item && item.affixes.some(a => a.key === 'multi_hit')) multiHitAffixCount++;
            });
            if (multiHitAffixCount > 0) {
                const totalMultiHitChance = (multiHitAffixCount * 5) + attackerGamblerBonus;
                if(rollPercentage(totalMultiHitChance)) {
                    this.logMessage('combat', `${attacker.name} 的 [連擊的] 詞綴發動，發起了追擊！`, 'skill');
                    await new Promise(res => setTimeout(res, 500));
                    await this.processAttack(attacker, currentTarget, true);
                }
            }
        }

        if (!currentTarget.isAlive()) {
            if (currentTarget.profession === '使徒' && rollPercentage(25)) {
                const reviveSkill = currentTarget.skills.find(s => s.id === 'apostle_spiral');
                const proliferateSkill = currentTarget.skills.find(s => s.id === 'apostle_proliferate');
                if (reviveSkill && proliferateSkill) {
                    currentTarget.currentHp = Math.floor(currentTarget.maxHp * 0.5);
                    proliferateSkill.currentCooldown = 0;
                    this.logMessage('combat', `${currentTarget.name} 在 [螺旋的權能] 的影響下復活了，並準備再次繁衍！`, 'crit');
                    return;
                }
            }
            this.logMessage('combat', `${currentTarget.name} 被擊敗了！`, 'system');
            const isTargetAnAlly = this.combat.allies.some(a => a.id === currentTarget.id);
            if (isTargetAnAlly) {
                if (currentTarget.id !== this.player.id) this.handlePartnerDeath(currentTarget.id);
            } else {
                this.gainResourcesFromEnemy(currentTarget);
                // **只有在敵人「不是」可俘虜單位 (FemaleHuman) 時，才觸發隨機掉落**
                if (!(currentTarget instanceof FemaleHuman)) {
                    this.handleLootDrop(currentTarget);
                }
            }
        }

        return true;
    },
    
    async executePlayerAction(action) {
        if (this.combat.isProcessing || this.combat.playerActionTaken || !this.player || !this.player.isAlive()) return;
        this.combat.playerActionTaken = true;

        let continueToEnemyTurn = true;

        if (action === 'attack') {
            if (this.player.activeSkillBuff?.id === 'combat_powerful_strike') {
                this.logMessage('combat', `[強力一擊] 效果觸發！`, 'crit');
            }
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
            // Escaped, do nothing
        } else {
            this.endCombat(true);
        }
    },
    
    async useSkill(skillId) {
        if (this.combat.isProcessing || this.combat.playerActionTaken) return;
        
        const skillData = this.learnedActiveSkills.find(s => s.id === skillId);
        
        if (!skillData || skillData.currentCooldown > 0) {
            this.showCustomAlert('技能尚未冷卻或無法使用！');
            return;
        }
        
        this.combat.playerActionTaken = true;
        this.modals.combatSkills.isOpen = false;
        this.logMessage('combat', `${this.player.name} 施放了技能 [${skillData.name}]！`, 'skill');

        const playerSkillInstance = this.player.skills.find(s => s.id === skillId);
        if (playerSkillInstance) {
            playerSkillInstance.currentCooldown = this.player.getFinalCooldown(skillData);
        }

        const zeroAuthId = 'combat_zero_authority';
        if (this.player && this.player.learnedSkills[zeroAuthId] && playerSkillInstance) {
            const zeroAuthData = SKILL_TREES.combat.find(s => s.id === zeroAuthId);
            if (rollPercentage(zeroAuthData.levels[0].effect.chance * 100)) {
                playerSkillInstance.currentCooldown = 0;
                this.logMessage('combat', `「歸零的權能」觸發！[${skillData.name}] 的冷卻時間被立即清除了！`, 'crit');
            }
        }

        const strikeSkills = ['combat_powerful_strike', 'combat_agile_strike', 'combat_enchanted_strike', 'combat_lucky_strike'];
        if (strikeSkills.includes(skillId)) {
            const skillLevel = this.player.learnedSkills[skillId];
            const effect = skillData.levels[skillLevel - 1].effect;
            
            this.player.activeSkillBuff = {
                id: skillId,
                multiplier: effect.multiplier,
                stat: effect.stat || 'strength'
            };

            const livingEnemies = this.combat.enemies.filter(t => t.isAlive());
            if (livingEnemies.length > 0) {
                const target = livingEnemies[randomInt(0, livingEnemies.length - 1)];
                await this.processAttack(this.player, target);
            }
        }
        // 處理 王之威壓 的邏輯
        else if (skillId === 'combat_kings_pressure') {
            const skillLevel = this.player.learnedSkills[skillId];
            const effect = skillData.levels[skillLevel - 1].effect;
            const partnerCount = this.combat.allies.length - 1; // 減去玩家自己
            const totalDebuff = partnerCount * effect.debuff_per_partner;
            const finalDuration = this.player.getFinalDuration(skillData);

            this.logMessage('combat', `基於 ${partnerCount} 名夥伴，對敵方全體施加了 ${Math.round(totalDebuff * 100)}% 的全屬性削弱，持續 ${finalDuration} 回合！`, 'skill');

            this.combat.enemies.filter(e => e.isAlive()).forEach(enemy => {
                enemy.statusEffects.push({
                    type: 'stat_debuff',
                    duration: finalDuration + 1, // +1 因為回合結束會立刻減1
                    multiplier: totalDebuff
                });
            });
        }
        // 處理 共生關係 的邏輯
        else if (skillId === 'combat_symbiosis') {
            const skillLevel = this.player.learnedSkills[skillId];
            const effect = skillData.levels[skillLevel - 1].effect;
            const finalDuration = this.player.getFinalDuration(skillData);

            this.logMessage('combat', `你與所有夥伴建立了 [共生關係]，受到的所有傷害將被分攤，並減免 ${Math.round(effect.damageReduction * 100)}%！持續 ${finalDuration} 回合。`, 'skill');

            this.combat.allies.filter(a => a.isAlive()).forEach(ally => {
                // 為所有存活的我方單位附加共生狀態
                ally.statusEffects.push({
                    type: 'symbiosis',
                    duration: finalDuration + 1, // +1 因為回合結束會立刻減1
                    damageReduction: effect.damageReduction
                });
            });
        } 

        if (this.combat.enemies.filter(e => e.isAlive()).length > 0) {
            await this.executeTurn(false);
        } else {
            this.endCombat(true);
        }
    },
    
    async attemptSneakEscape() {
        this.logMessage('combat', '你嘗試潛行脫離戰鬥...', 'player');
        
        const playerParty = this.combat.allies;
        const enemyParty = this.combat.enemies.filter(e => e.isAlive());
        const contestResult = this.performAbilityContest(playerParty, enemyParty);

        await this.showDiceRollAnimation('脫離判定', 
            contestResult.partyA_Details.rolls.map(r => ({ sides: 20, result: r })), 
            contestResult.partyB_Details.rolls.map(r => ({ sides: 20, result: r }))
        );

        this.logMessage('combat', `我方脫離擲骰: ${contestResult.partyA_Value - contestResult.partyA_Details.partySize} + 人數 ${contestResult.partyA_Details.partySize} = ${contestResult.partyA_Value}`, 'info');
        this.logMessage('combat', `敵方追擊擲骰: ${contestResult.partyB_Value - contestResult.partyB_Details.partySize} + 人數 ${contestResult.partyB_Details.partySize} = ${contestResult.partyB_Value}`, 'info');
        
        if (contestResult.partyA_Value > contestResult.partyB_Value) { 
            this.logMessage('combat', '脫離成功！', 'success');
            this.finishCombatCleanup();
            return 'escaped';
        } else {
            this.logMessage('combat', '脫離失敗！', 'enemy');
            return 'failed';
        }
    },
    
    triggerRevengeSquadBattle(difficulty, pendingBirths = []) {
        this.postBattleBirths = pendingBirths;

        const squadCompositions = {
            easy:   { knights: { '士兵': 1, '盾兵': 1 }, residents: 4 },
            normal: { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1 }, residents: 5 },
            hard:   { knights: { '士兵': 2, '盾兵': 1, '槍兵': 1, '弓兵': 1, '騎士': 1, '法師': 1 }, residents: 6 },
            hell:   { knights: { '士兵': 3, '盾兵': 2, '槍兵': 2, '弓兵': 1, '騎士': 1, '法師': 1, '祭司': 1 }, residents: 7 }
        };
        const knightStatRanges = {
            easy: [65, 120], normal: [120, 190], hard: [190, 280], hell: [280, 360]
        };
        const residentStatRanges = {
            easy: [20, 20], normal: [20, 40], hard: [40, 80], hell: [80, 140]
        };

        const composition = squadCompositions[difficulty];
        const knightStatRange = knightStatRanges[difficulty];
        const residentStatRange = residentStatRanges[difficulty];
        let revengeSquad = [];

        for (const unitType in composition.knights) {
            for (let i = 0; i < composition.knights[unitType]; i++) {
                const totalStatPoints = randomInt(knightStatRange[0], knightStatRange[1]);
                const unit = rollPercentage(50) 
                    ? new FemaleKnightOrderUnit(unitType, totalStatPoints, difficulty)
                    : new KnightOrderUnit(unitType, totalStatPoints, difficulty);
                this.equipEnemy(unit, difficulty);
                revengeSquad.push(unit);
            }
        }

        for (let i = 0; i < composition.residents; i++) {
            const totalStatPoints = randomInt(residentStatRange[0], residentStatRange[1]);
            let unit; 
            if (rollPercentage(50)) {
                const profession = PROFESSIONS[randomInt(0, PROFESSIONS.length - 1)];
                unit = new FemaleHuman(FEMALE_NAMES[randomInt(0, FEMALE_NAMES.length - 1)], distributeStats(totalStatPoints, ['strength', 'agility', 'intelligence', 'luck', 'charisma']), profession, generateVisuals(), difficulty);
            } else {
                unit = new MaleHuman(MALE_NAMES[randomInt(0, MALE_NAMES.length - 1)], distributeStats(totalStatPoints), '男性居民', difficulty);
            }
            this.equipEnemy(unit, difficulty);
            revengeSquad.push(unit);
        }
        
        this.combat.isReinforcementBattle = false;
        this.combat.isUnescapable = true;
        this.startCombat(revengeSquad, true);
    },
    
    cloneApostle(attacker) {
        const newClone = new ApostleMaiden(this.combat);
        newClone.currentHp = attacker.currentHp;
        newClone.skills = JSON.parse(JSON.stringify(attacker.skills));
        newClone.statusEffects = JSON.parse(JSON.stringify(attacker.statusEffects));
        return newClone;
    },  

    triggerApostleBattle() {
        const apostleData = SPECIAL_BOSSES.apostle_maiden;
        this.logMessage('tribe', `你無盡的繁衍似乎觸動了世界的某種禁忌...空間被撕裂了...`, 'enemy');

        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = apostleData.name;
        modal.type = "tutorial";
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = apostleData.avatar;
        modal.content = `<p class="text-lg leading-relaxed">${apostleData.dialogues.intro.join('<br><br>')}</p>`;
        
        modal.onConfirm = () => {
            const apostle = new ApostleMaiden(this.combat);
            this.combat.isUnescapable = true;
            this.startCombat([apostle], true);
        };
    },

    triggerGoddessBattle() {
        const goddessData = SPECIAL_BOSSES.spiral_goddess_mother;
        this.logMessage('tribe', `整個世界似乎都在震動...一股無法抗拒的、神聖而威嚴的意志降臨到了你的部落！`, 'enemy');

        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = goddessData.name;
        modal.type = "tutorial";
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = goddessData.avatar;
        modal.content = `<p class="text-lg leading-relaxed">${goddessData.dialogues.intro}</p>`;
        
        modal.onConfirm = () => {
            const goddess = new SpiralGoddess(this.combat);
            this.combat.isUnescapable = true;
            this.startCombat([goddess], false);
        };
    },

    promptGoddessQuestionAndWaitForAnswer() {
        return new Promise(resolve => {
            const goddess = this.combat.enemies[0];
            const qnaData = SPECIAL_BOSSES.spiral_goddess_mother.qna;
            if (goddess.qnaIndex < qnaData.length) {
                this.combat.isGoddessQnA = true;
                this.combat.goddessQuestion = qnaData[goddess.qnaIndex].question;
                this.combat.playerAnswer = '';
                this.combat.resolveGoddessAnswer = resolve; 
            } else {
                resolve({ finished: true });
            }
        });
    },

    submitGoddessAnswer() {
        if (this.combat.isGoddessQnA && typeof this.combat.resolveGoddessAnswer === 'function') {
            this.combat.isGoddessQnA = false;
            this.combat.resolveGoddessAnswer({ answer: this.combat.playerAnswer });
            this.combat.resolveGoddessAnswer = null;
        }
    },
    
    resetAllSkillCooldowns() {
        if (!this.player || !this.player.skills) return;
        this.player.skills.forEach(skillInstance => {
            skillInstance.currentCooldown = 0;
        });
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
                // 先計算出這個技能的基礎傷害值
                const baseSkillDamage = Math.floor(caster.getTotalStat(damageStat, this.isStarving, this) * skill.multiplier);

                this.logMessage('combat', `${caster.name} 的 [${skill.name}] 襲向我方全體！`, 'skill');

                // 對每一個目標，都呼叫一次完整的攻擊判定流程
                for (const target of enemies) {
                    if (target.isAlive()) {
                        // 使用 await 確保每個攻擊動畫和日誌都依序出現
                        await this.processAttack(caster, target, false, baseSkillDamage);
                        // 加入一個短暫的延遲，讓戰鬥日誌更容易閱讀
                        await new Promise(res => setTimeout(res, 200)); 
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
                caster.statusEffects.push({ 
                    type: 'charge_nuke', 
                    duration: skill.chargeTime + 1, 
                    chargeTurns: skill.chargeTime, 
                    multiplier: skill.multiplier
                });
                this.logMessage('combat', `${caster.name} 開始詠唱咒文，空氣變得凝重起來...`, 'info');
                break;
            case 'team_heal':
                const healAmount = caster.getTotalStat('intelligence', this.isStarving, this) * allies.length;
                allies.forEach(ally => {
                    if(ally.isAlive()) {
                        ally.currentHp = Math.min(ally.maxHp, ally.currentHp + healAmount);
                    }
                });
                this.logMessage('combat', `聖光籠罩了騎士團，每名成員恢復了 ${healAmount} 點生命！`, 'success');
                break;

            case 'apostle_clone': {
                this.logMessage('combat', `${caster.name} 施放了 <span class="text-pink-400">[繁衍的權能]</span>！`, 'skill');
                const newClone = this.cloneApostle(caster);
                this.combat.enemies.push(newClone);

                // 重置本體和分身的技能冷卻
                caster.skills.find(s => s.id === 'apostle_proliferate').currentCooldown = skill.baseCooldown;
                newClone.skills.find(s => s.id === 'apostle_proliferate').currentCooldown = skill.baseCooldown;

                this.logMessage('combat', `一個新的 ${newClone.name} 出現在戰場上！`, 'enemy');

                // 處理被動「重現的權能」，讓施法者立即再次行動 (進行一次普通攻擊)
                this.logMessage('combat', `在 [重現的權能] 的影響下，${caster.name} 立即再次行動！`, 'skill');
                const livingAllies = this.combat.allies.filter(a => a.isAlive());
                if (livingAllies.length > 0) {
                    const target = livingAllies[randomInt(0, livingAllies.length - 1)];
                    // 使用 await 確保攻擊動畫播放完畢
                    await this.processAttack(caster, target, false);
                }
                break;
            }
                
            // 處理「世紀的洪流」技能
            case 'custom_aoe_5stat': { // 使用大括號建立獨立作用域
                if (!skill.hasBeenUsed) {
                    await this.showDialogueWithAvatar(caster.name, 'assets/century_transcended_avatar.png', skill.firstUseDialogue);
                    skill.hasBeenUsed = true;
                }
                const totalStats = Object.values(caster.stats).reduce((a, b) => a + b, 0);
                this.logMessage('combat', `${caster.name} 的 [${skill.name}] 釋放出毀滅性的能量！`, 'skill');

                let hitCount = 0; // 新增命中計數器
                for (const target of enemies) {
                    if (target.isAlive()) {
                        const hitSuccess = await this.processAttack(caster, target, false, totalStats);
                        if (hitSuccess) {
                            hitCount++; // 如果命中，計數器+1
                        }
                        await new Promise(res => setTimeout(res, 200));
                    }
                }

                // 根據命中數賦予額外行動
                if (hitCount > 0) {
                    caster.extraActions = (caster.extraActions || 0) + hitCount;
                    this.logMessage('combat', `[世紀的洪流] 成功命中 ${hitCount} 個目標！${caster.name} 觸發了 [超越]，獲得了 ${hitCount} 次額外行動！`, 'crit');
                }
                break;   
            }
        }
        await new Promise(res => setTimeout(res, 500));
    },

    handlePartnerDeath(partnerId) {
        const partner = this.partners.find(p => p.id === partnerId);
        if (!partner) return;

        const skillId = 'tribe_spiral_authority';
        if (this.player && this.player.learnedSkills[skillId]) {
            const skillData = SKILL_TREES.tribe.find(s => s.id === skillId);
            if (rollPercentage(skillData.levels[0].effect.chance * 100)) {
                partner.currentHp = partner.maxHp;
                this.logMessage('combat', `在「螺旋的權能」的守護下，${partner.name} 奇蹟般地從死亡邊緣歸來！`, 'crit');
                return; 
            }
        }

        this.logMessage('combat', `你的夥伴 ${partner.name} 在戰鬥中陣亡了！他將永遠離開你...`, 'enemy');
        this._removePartnerFromAllAssignments(partnerId);
        this.partners = this.partners.filter(p => p.id !== partnerId);
        this.player.updateHp(this.isStarving);
    },
};