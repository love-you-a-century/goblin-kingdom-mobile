// js/modules/narrative.js

const narrativeModule = {
    handleBreedingClick() {
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
        if (this.userApiKey && this.userApiKey.trim() !== '') {
            this.startBreedingNarrative();
        } else {
            this.executeQuickBreeding();
        }
    },

    executeQuickBreeding() {
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        for (const id of selectedIds) {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                this.totalBreedingCount++;
            }
        }

        // 檢查使徒
        if (this.totalBreedingCount >= 69 && !this.flags.defeatedApostle && !this.pendingDecisions.some(d => d.type === 'apostle_battle')) {
            this.pendingDecisions.push({ type: 'apostle_battle' });
        }
        // 檢查女神 (確保已擊敗使徒)
        if (this.totalBreedingCount >= 88 && this.flags.defeatedApostle && !this.flags.defeatedGoddess && !this.pendingDecisions.some(d => d.type === 'goddess_battle')) {
            this.pendingDecisions.push({ type: 'goddess_battle' });
        }

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性快速進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        this.modals.dungeon.selectedBreedIds = [];

        // 檢查是否剛觸發了重大事件
        const hasMajorEvent = this.pendingDecisions.some(d => d.type === 'apostle_battle' || d.type === 'goddess_battle');

        // 先關閉建設視窗
        this.modals.construction.isOpen = false; 

        // 如果有重大事件，則立即處理；否則，顯示常規提示
        if (hasMajorEvent) {
            this.processNextDecision();
        } else {
            this.showCustomAlert('繁衍已完成！');
        }
    },
    
    giveBirth(mother) {
        if (!mother || !mother.stats) {
            this.logMessage('tribe', `一名孕母的資料異常，本次生產失敗！`, 'enemy');
            if(mother) { mother.isPregnant = false; mother.pregnancyTimer = 0; }
            return;
        }

        let numberOfBirths = 1;
        const polyspermySkillId = 'breed_polyspermy';
        if (this.player && this.player.learnedSkills[polyspermySkillId]) {
            const skillLevel = this.player.learnedSkills[polyspermySkillId];
            const skillData = SKILL_TREES.breeding.find(s => s.id === polyspermySkillId);
            const effect = skillData.levels[skillLevel - 1].effect;
            
            const roll = Math.random();
            if (effect.triplets_chance && roll < effect.triplets_chance) {
                numberOfBirths = 3;
                this.logMessage('tribe', `奇蹟發生了！在「多精卵」的影響下，${mother.name} 誕下了三胞胎！`, 'crit');
            } else if (roll < (effect.triplets_chance || 0) + effect.twins_chance) {
                numberOfBirths = 2;
                this.logMessage('tribe', `在「多精卵」的影響下，${mother.name} 誕下了雙胞胎！`, 'success');
            }
        }

        for (let i = 0; i < numberOfBirths; i++) {
            const pStats = this.player.stats;
            const mStats = mother.stats;
            let newStats = {
                strength: Math.floor(((pStats.strength || 0) + (mStats.strength || 0)) / 4 + (mStats.charisma || 0) / 2),
                agility: Math.floor(((pStats.agility || 0) + (mStats.agility || 0)) / 4 + (mStats.charisma || 0) / 2),
                intelligence: Math.floor(((pStats.intelligence || 0) + (mStats.intelligence || 0)) / 4 + (mStats.charisma || 0) / 2),
                luck: Math.floor(((pStats.luck || 0) + (mStats.luck || 0)) / 4 + (mStats.charisma || 0) / 2)
            };

            const eugenicsSkillId = 'breed_eugenics';
            if (this.player && this.player.learnedSkills[eugenicsSkillId]) {
                const skillLevel = this.player.learnedSkills[eugenicsSkillId];
                const skillData = SKILL_TREES.breeding.find(s => s.id === eugenicsSkillId);
                const chance = skillData.levels[skillLevel - 1].effect.chance;
                if (Math.random() < chance) {
                    const rawStatSum = pStats.strength + pStats.agility + pStats.intelligence + pStats.luck;
                    const bonusPoints = Math.floor(rawStatSum / 10);
                    if (bonusPoints > 0) {
                        this.logMessage('tribe', '在「優生學」的影響下，一名後代獲得了額外的潛力！', 'success');
                        for (let j = 0; j < bonusPoints; j++) {
                            const randomStat = ['strength', 'agility', 'intelligence', 'luck'][randomInt(0, 3)];
                            newStats[randomStat]++;
                        }
                    }
                }
            }

            const newName = `(${(mother.profession || '未知')}${(mother.name || '無名')}之子)哥布林`;
            const newPartner = new Goblin(newName, newStats);
            newPartner.maxHp = newPartner.calculateMaxHp(this.isStarving);
            newPartner.currentHp = newPartner.maxHp;
            this.postBattleBirths.push({ mother: mother, newborn: newPartner });
        }

        mother.isPregnant = false;
        mother.pregnancyTimer = 0;
        mother.isMother = true;
        this.logMessage('tribe', `${mother.name} 現在開始在產房為部落貢獻奶水。`, 'info');
    },

    startBreedingNarrative(overrideCaptives = null) { // 新增 overrideCaptives 參數
        const modal = this.modals.narrative;
        
        // 判斷要使用的俘虜來源
        const selectedCaptives = overrideCaptives 
            ? overrideCaptives 
            : this.captives.filter(c => this.modals.dungeon.selectedBreedIds.includes(c.id));

        if (selectedCaptives.length === 0) {
            this.showCustomAlert("找不到有效的繁衍對象。");
            return;
        }

        modal.title = "繁衍";
        modal.type = "breeding";
        modal.isAwaitingConfirmation = true;
        modal.isLoading = false;
        modal.context = [];
        modal.currentCaptives = selectedCaptives; // 現在會使用正確的來源
        modal.hasBred = false;
        
        this.modals.construction.isOpen = false;
        this.screen = 'breeding_narrative'; 
    },

    confirmAndStartBreedingNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false;
        modal.isLoading = true;
        this.generateNarrativeSegment('開始');
    },

    closeNarrativeModal() {
        if (this.modals.narrative.type === 'breeding' && this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
            this.nextDay();
        }
        
        if (this.modals.narrative.type === 'birth') {
            this.screen = 'tutorial_query';
        }

        if (this.modals.narrative.type === 'tutorial') {
            // No action needed
        }

        this.modals.narrative.isOpen = false;
        this.modals.narrative.type = '';
        this.modals.narrative.content = '';
    },

    confirmNarrativeModal() {
        const modal = this.modals.narrative;
        modal.isOpen = false;
        if (typeof modal.onConfirm === 'function') {
            setTimeout(() => {
                modal.onConfirm();
                modal.onConfirm = null;
            }, 200);
        }
    },

    finalizeBreedingAndReturn() {
        if (this.modals.narrative.hasBred) {
            this.modals.dungeon.selectedBreedIds = [];
        }
        this.returnToBreedingModal('繁衍已完成！');
    },

    executeQuickBreedingAndReturn() {
        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;

        selectedIds.forEach(id => {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                this.totalBreedingCount++;
            }
        });

        // 檢查使徒
        if (this.totalBreedingCount >= 69 && !this.flags.defeatedApostle && !this.pendingDecisions.some(d => d.type === 'apostle_battle')) {
            this.pendingDecisions.push({ type: 'apostle_battle' });
        }
        // 檢查女神 (確保已擊敗使徒)
        if (this.totalBreedingCount >= 88 && this.flags.defeatedApostle && !this.flags.defeatedGoddess && !this.pendingDecisions.some(d => d.type === 'goddess_battle')) {
            this.pendingDecisions.push({ type: 'goddess_battle' });
        }

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');
        
        this.modals.dungeon.selectedBreedIds = [];

        this.screen = 'tribe';
        this.modals.construction.isOpen = true;
        this.modals.construction.activeTab = 'dungeon';
        this.modals.dungeon.subTab = 'breed';
        this.showCustomAlert('繁衍已完成！');
    },

    async confirmAndNarrateBreeding() {
        if (this.modals.narrative.hasBred) return;

        const selectedIds = this.modals.dungeon.selectedBreedIds;
        const selectedCount = selectedIds.length;
        
        for (const id of selectedIds) {
            const captive = this.captives.find(c => c.id === id);
            if (captive && !captive.isPregnant) {
                captive.isPregnant = true;
                captive.pregnancyTimer = 3;
                this.player.attributePoints++;
                captive.breedingCount = (captive.breedingCount || 0) + 1;
                this.totalBreedingCount++;
            }
        }

        // 檢查使徒
        if (this.totalBreedingCount >= 69 && !this.flags.defeatedApostle && !this.pendingDecisions.some(d => d.type === 'apostle_battle')) {
            this.pendingDecisions.push({ type: 'apostle_battle' });
        }
        // 檢查女神 (確保已擊敗使徒)
        if (this.totalBreedingCount >= 88 && this.flags.defeatedApostle && !this.flags.defeatedGoddess && !this.pendingDecisions.some(d => d.type === 'goddess_battle')) {
            this.pendingDecisions.push({ type: 'goddess_battle' });
        }

        this.breedingChargesLeft -= selectedCount;
        this.logMessage('tribe', `你與 ${selectedCount} 名女性進行了繁衍，獲得了 ${selectedCount} 點能力點。`, 'success');

        this.modals.narrative.hasBred = true;
        await this.generateNarrativeSegment('繁衍');
    },

    async generateIntroNarrative() {
        const modal = this.modals.narrative;
        modal.isAwaitingConfirmation = false;
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
        modal.isAwaitingConfirmation = false;
        modal.isLoading = true;
        modal.content = '';

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
        // 增加一個判斷，確認當前對象是否為埃達
        const isAda = captives.length === 1 && captives[0].profession === '鐵匠(公主?)';
        
        let prompt = '';
        let baseInstruction = '';

        // 輔助函式：建立詳細的角色描述字串 (保持不變)
        const getCaptiveDetailsString = (c) => {
            let details = `- 名稱: ${c.name}, 職業: ${c.profession}, 種族: ${c.race}, 個性: ${c.visual.personality}, 髮色: ${c.visual.hairColor}, 髮型: ${c.visual.hairStyle}, ${c.visual.bust}罩杯, 身高 ${c.visual.height}cm, 年紀 ${c.visual.age}歲, 服裝: ${c.visual.clothing}`;
            if (c.race === 'elf' && c.visual.elfEars) {
                details += `, 耳朵: ${c.visual.elfEars}`;
            }
            if (c.race === 'beastkin' && c.visual.beastkinSubspecies) {
                details += `, 亞種特徵: ${c.visual.beastkinSubspecies}`;
            }
            details += `, 已被繁衍次數: ${c.breedingCount || 0}`;
            return details;
        };

        if (isAda) {
            // 如果是埃達，使用全新的專屬劇本
            baseInstruction = "gemini與我製作做了以哥布林王為主角的角色扮演遊戲，玩家是這個世界後一隻哥布林，若不進行繁衍，這個種族恐將滅絕。埃達自願成為哥布林王的伴侶，但個性仍然有些傲嬌，請以哥布林王的視角，描寫一段與矮人鐵匠『埃達』的繁衍過程，好讓玩家能透過文字想像這個場景。";
            const adaDetails = getCaptiveDetailsString(captives[0]);

            if (modal.context.length === 0) {
                prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n\n**伴侶資訊:**\n${adaDetails}\n\n故事從哥布林王在夜晚來到埃達的兵工廠（鍛鐵工坊）開始。描寫工坊內火爐餘溫、金屬與汗水氣味的環境，以及埃達有些害羞、嘴上不饒人但並未反抗的反應。\n請撰寫一段約150-200字，充滿氣氛和細節的開場故事。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n敘事將描述每一個動作、行為、生理反應及雙方感受。`;
            } else {
                const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約150-200字），保持場景在鍛鐵工坊，並維持埃達傲嬌但順從的反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
            }

        } else {
            // 如果不是埃達，則使用原本的地牢俘虜劇本
            baseInstruction = "gemini與我製作做了以哥布林王為主角的角色扮演遊戲，玩家是這個世界後一隻哥布林，若不進行繁衍，這個種族恐將滅絕。請以哥布林王的視角，描寫一段與俘虜的繁衍過程，好讓玩家能透過文字想像這個場景。";
            const isSoloScene = captives.length === 1 && this.player.party.length === 0;

            if (isSoloScene) {
                const captiveDetails = getCaptiveDetailsString(captives[0]);
                if (modal.context.length === 0) {
                    prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n\n**女性俘虜資訊:**\n${captiveDetails}\n\n故事從哥布林王決定 "${action}" 開始。描寫地牢環境，以及哥布林王打開牢房，進入到內。\n請撰寫一段約100-200字，充滿氣氛和細節的開場故事，以及女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n敘事描述每一個動作、行為、生理反應及雙方感受。`;
                } else {
                    const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                    prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約150-200字），保持風格一致，並描寫女性的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
                }
            } else {
                let captivesDetails = captives.map(c => getCaptiveDetailsString(c)).join('\n');
                let partnersDetails = this.player.party.length > 0 ? `你帶領著 ${this.player.party.length} 位哥布林夥伴一同參與。` : '';
                if (modal.context.length === 0) {
                    prompt = `${baseInstruction}\n\n**哥布林王資訊:**\n- 名稱: ${this.player.name}\n- 外貌: ${this.player.appearance}\n- 身高: ${this.player.height} cm\n- 雄風: ${this.player.penisSize} cm\n${partnersDetails}\n\n**女性俘虜資訊:**\n${captivesDetails}\n\n故事從哥布林王決定 "${action}" 開始。描寫地牢環境，以及哥布林王打開牢房，進入到內。\n請撰寫一段約200-250字，充滿氣氛和細節的開場故事。哥布林王以及女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n敘事將描述每一個動作、行為、生理反應及雙方感受。`;
                } else {
                    const storySoFar = modal.context.map(turn => `哥布林王：${turn.user}\n${turn.model}`).join('\n\n');
                    prompt = `接續以下的故事，哥布林王想 "${action}"。請根據這個新動作，繼續撰寫故事的下一段落（約150-200字），保持風格一致，並描寫女性們的外貌、反應。\n對話請嚴格遵循格式：職業 + 名字「說話內容...等」(動作、感受...等)。\n\n**故事至此:**\n${storySoFar}`;
                }
            }
        }

        modal.context.push({ user: action });

        try {
            const text = await this.callGeminiAPI(prompt, 0.5);

            if (text === null) {
                modal.content = "（由於內容限制，AI 敘事生成失敗。請直接繁衍，或返回部落。）";
                modal.context.pop(); 
            } else {
                modal.content = text.replace(/\n/g, '<br>');
                modal.context[modal.context.length - 1].model = text;
            }

        } catch (error) {
            modal.content = error.message;
            modal.context.pop();
        } finally {
            modal.isLoading = false;
        }
    },

    async callGeminiAPI(prompt, temperature = 0.7) {
        if (!this.userApiKey || this.userApiKey.trim() === '') {
            return "（AI 敘事功能需要 API 金鑰。請刷新頁面，在初始畫面中輸入您的金鑰。）";
        }

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: temperature
            },
            // 【新增】加入安全設定，嘗試放寬一些限制
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }, // 保持對露骨內容的過濾
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
            ]
        };
        const apiKey = this.userApiKey;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("API Error Response:", errorData);
                if (response.status === 400) return "（您的 API 金鑰無效或格式錯誤，請刷新頁面重新輸入。）";
                if (response.status === 429) return "（對AI的請求過於頻繁，已觸發流量限制，請稍後再試。）";
                return `（API 請求失敗，狀態碼: ${response.status}）`;
            }

            const result = await response.json();

            // 這是最關鍵的部分
            // 如果 API 回應沒有候選內容 (通常是因為安全阻擋)，我們回傳 null
            if (!result.candidates || result.candidates.length === 0) {
                console.warn("API returned no candidates, likely due to safety filters.", result.promptFeedback);
                return null; // 回傳 null 表示生成失敗
            }
            
            if (result.candidates[0]?.content?.parts?.[0]) {
                return result.candidates[0].content.parts[0].text;
            } else {
                // 這種情況比較少見，但還是處理一下
                console.error("Unexpected API response structure:", result);
                return null; // 同樣視為失敗
            }

        } catch (error) {
            console.error("Fetch API Error:", error);
            return `（網路連線錯誤，無法連接至 AI 伺服器。）`;
        }
    },

    triggerCroneDialogue() {
        const modal = this.modals.narrative;
        modal.isOpen = true;
        modal.title = "與老婦的對話";
        modal.type = "tutorial";
        modal.isLoading = false;
        modal.isAwaitingConfirmation = false;
        modal.avatarUrl = 'assets/crone_avatar.png';
        modal.content = `
            <p class="text-lg leading-relaxed">「有趣...如今獲得了看似無敵的權能，即使在此將你抹除，你也只會再次於那個破舊的部落中醒來。但眾神的目光永遠注視著你。」</p>
            <br>
            <p class="text-lg leading-relaxed">「給你一個忠告，孩子，關於『世紀』...要記住，魔鬼總是藏在細節裡，不要輕信惡魔的甜言蜜語。」</p>
            <br>
            <p class="text-lg leading-relaxed">「還有...不要做得太過火了，過往的哥布林一族，正是因為無盡的貪婪與暴力才招致滅亡...不要重蹈覆轍，也不要與過去加害哥布林一族的人一樣。」</p>
            <br>
            <p class="text-lg leading-relaxed">「另外，別太自滿了...真正的我們，是你無法觸及的存在。你走吧...」</p>
        `;
    },
};