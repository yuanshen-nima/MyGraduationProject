import { MapManager } from './map_manager.js';
import { ChartManager } from './chart_manager.js';
import { SidebarManager } from './sidebar_manager.js';

const mapManager = new MapManager('map', 'legendBox');
const chartManager = new ChartManager('statsChart', 'indicesChart');
const sidebarManager = new SidebarManager();

document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> 系统初始化...");
    
    // 1. 初始化各模块
    sidebarManager.init();
    mapManager.init();
    try { 
        chartManager.init(); 
    } catch (e) { 
        console.error("图表初始化警告:", e); 
    }

    // 2. 侧边栏联动图表激活
    sidebarManager.onPanelOpen = (targetId) => {
        const tools = document.getElementById('panelTools');
        const shouldShowTools = (targetId === 'stats' || targetId === 'indices');
        
        if (tools) tools.style.display = shouldShowTools ? 'flex' : 'none';

        try { 
            if (shouldShowTools) chartManager.setActive(targetId);
            else chartManager.setActive(null);
        } catch(e) {}
    };

    // 3. 顶部小工具栏事件
    const toolContainer = document.getElementById('panelTools');
    if (toolContainer) {
        toolContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.tool-btn');
            if (!btn) return;

            if (!chartManager.activeChart && (sidebarManager.activeTab === 'stats' || sidebarManager.activeTab === 'indices')) {
                chartManager.setActive(sidebarManager.activeTab);
            }

            const action = btn.dataset.action;
            if (action === 'bar' || action === 'line') chartManager.switchType(action);
            else if (action === 'restore') chartManager.restore();
            else if (action === 'save') chartManager.saveImage();
        });
    }

    // 4. 预测按钮
    const predictBtn = document.getElementById('predictBtn');
    if(predictBtn) {
        predictBtn.addEventListener('click', (e) => {
            if (!chartManager.activeChart) chartManager.setActive('indices');
            chartManager.runPrediction(e.currentTarget);
        });
    }

    // ==========================================
    // ★ 5. 分析面板事件 (卷帘与桑基图) ★
    // ==========================================
    
    // 卷帘开关
    const btnToggleSwipe = document.getElementById('btnToggleSwipe');
    let isSwipeActive = false; 
    
    if(btnToggleSwipe) {
        btnToggleSwipe.addEventListener('click', () => {
            const y1 = document.getElementById('swipeLeftYear').value;
            const y2 = document.getElementById('swipeRightYear').value;
            
            isSwipeActive = !isSwipeActive; 
            
            if(isSwipeActive) {
                btnToggleSwipe.innerHTML = '<i class="fa-solid fa-xmark"></i> 退出卷帘模式';
                btnToggleSwipe.classList.add('active'); 
                mapManager.toggleSwipeMode(parseInt(y1), parseInt(y2), true);
            } else {
                btnToggleSwipe.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i> 开启/关闭 卷帘模式';
                btnToggleSwipe.classList.remove('active'); 
                mapManager.toggleSwipeMode(parseInt(y1), parseInt(y2), false);
            }
        });
    }

    // 桑基图生成
    const btnGenSankey = document.getElementById('btnGenSankey');
    if(btnGenSankey) {
        btnGenSankey.addEventListener('click', () => {
            const y1 = parseInt(document.getElementById('sankeyStartYear').value);
            const y2 = parseInt(document.getElementById('sankeyEndYear').value);
            chartManager.renderSankey(y1, y2);
        });
    }
});

// 窗口尺寸变化处理
window.addEventListener('resize', () => {
    mapManager.resize();
});