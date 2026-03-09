export class SidebarManager {
    constructor() {
        this.panel = document.getElementById('sidebarPanel');
        this.navItems = document.querySelectorAll('.nav-item');
        this.closeBtn = document.getElementById('closeSidebar');
        this.panelTitle = document.getElementById('panelTitle');
        this.contents = document.querySelectorAll('.panel-content');
        this.resizer = document.getElementById('panelResizer');

        this.activeTab = null;
        
        // 拖拽状态
        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
    }

    init() {
        this.navItems.forEach(item => {
            item.addEventListener('click', () => this.toggle(item.dataset.target, item));
        });
        this.closeBtn.addEventListener('click', () => this.close());

        // 初始化拖拽
        this._initResizer();
    }

    _initResizer() {
        if(!this.resizer) return;

        this.resizer.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startWidth = parseInt(window.getComputedStyle(this.panel).width, 10);
            
            this.resizer.classList.add('resizing');
            this.panel.style.transition = 'none'; // 禁用过渡，防止卡顿
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // 禁止选中文字
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isResizing) return;

            // 计算偏移量：向右移动(clientX变大) -> 宽度增加
            const dx = e.clientX - this.startX;
            let newWidth = this.startWidth + dx;

            // 限制范围
            if (newWidth < 320) newWidth = 320;
            if (newWidth > 900) newWidth = 900; // 最大允许拉到 900px

            this.panel.style.width = `${newWidth}px`;
            // 注意：这里不需要再手动通知图表了，因为 ChartManager 里的 ResizeObserver 会自动处理
        });

        document.addEventListener('mouseup', () => {
            if (!this.isResizing) return;
            this.isResizing = false;
            this.resizer.classList.remove('resizing');
            this.panel.style.transition = ''; // 恢复过渡
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    toggle(targetId, navItem) {
        if (this.activeTab === targetId && this.panel.classList.contains('visible')) {
            this.close();
            return;
        }
        this.open(targetId, navItem);
    }

    open(targetId, navItem) {
        this.activeTab = targetId;
        this.navItems.forEach(n => n.classList.remove('active'));
        navItem.classList.add('active');
        
        const icon = navItem.querySelector('i').className;
        this.panelTitle.innerHTML = `<i class="${icon}"></i> ${navItem.title}`;
        
        this.contents.forEach(c => c.classList.remove('active'));
        const targetContent = document.getElementById(`content-${targetId}`);
        if(targetContent) targetContent.classList.add('active');
        
        this.panel.classList.add('visible');
    }

    close() {
        this.panel.classList.remove('visible');
        this.navItems.forEach(n => n.classList.remove('active'));
        this.activeTab = null;
    }
}