// js/modules/helpWidget.js

const helpWidgetModule = {
    initDraggableWidget(event, element) {
        // 防止在輸入框或按鈕上觸發拖曳
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // 如果點擊的是展開的面板標頭，或是收合的按鈕，才允許拖曳
        const canDrag = event.target.closest('.help-widget-header') || event.target.closest('.help-widget-button');

        if (!canDrag || (this.helpWidget.isOpen && !event.target.closest('.help-widget-header'))) {
            return;
        }

        event.preventDefault();
        this.helpWidget.isDragging = true;

        const isTouchEvent = event.type.startsWith('touch');
        const moveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
        const upEvent = isTouchEvent ? 'touchend' : 'mouseup';

        const startX = isTouchEvent ? event.touches[0].clientX : event.clientX;
        const startY = isTouchEvent ? event.touches[0].clientY : event.clientY;
        const startLeft = this.helpWidget.position.x;
        const startTop = this.helpWidget.position.y;

        const handleMove = (e) => {
            if (!this.helpWidget.isDragging) return;
            const currentX = isTouchEvent ? e.touches[0].clientX : e.clientX;
            const currentY = isTouchEvent ? e.touches[0].clientY : e.clientY;
            const dx = currentX - startX;
            const dy = currentY - startY;

            this.helpWidget.position.x = startLeft + dx;
            this.helpWidget.position.y = startTop + dy;
        };

        const handleUp = () => {
            this.helpWidget.isDragging = false;
            document.removeEventListener(moveEvent, handleMove);
            document.removeEventListener(upEvent, handleUp);
            this.checkWidgetBounds(element);
        };

        document.addEventListener(moveEvent, handleMove);
        document.addEventListener(upEvent, handleUp);
    },

    checkWidgetBounds(element) {
        if (!element) return;
        const edgeThreshold = 50;
        let newX = this.helpWidget.position.x;
        let newY = this.helpWidget.position.y;
        let isNearEdge = false;

        // 檢查邊界
        if (newX < edgeThreshold || newX > window.innerWidth - element.offsetWidth - edgeThreshold ||
            newY < edgeThreshold || newY > window.innerHeight - element.offsetHeight - edgeThreshold) {
            isNearEdge = true;
        }

        // 確保不會拖出畫面外
        newX = Math.max(10, Math.min(newX, window.innerWidth - element.offsetWidth - 10));
        newY = Math.max(10, Math.min(newY, window.innerHeight - element.offsetHeight - 10));

        this.helpWidget.position.x = newX;
        this.helpWidget.position.y = newY;
        this.helpWidget.isMinimized = isNearEdge;

        // ++ 新增判斷：根據X位置決定打開方向 ++
        this.helpWidget.opensToLeft = newX > window.innerWidth / 2;
    },

    toggleHelpWidget() {
        // ++ 新增判斷：在打開前決定方向 ++
        if (!this.helpWidget.isOpen) {
            this.helpWidget.opensToLeft = this.helpWidget.position.x > window.innerWidth / 2;
        }

        this.helpWidget.isOpen = !this.helpWidget.isOpen;
        if (this.helpWidget.isOpen) {
            this.helpWidget.isMinimized = false;
        } else {
            this.checkWidgetBounds(this.$refs.helpWidget);
        }
    },
};