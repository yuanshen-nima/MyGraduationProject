import { CLASS_CONFIG } from './config.js';
import { ApiService } from './api.js';

export class ChartManager {
    constructor(statsId, indicesId) {
        this.statsDom = document.getElementById(statsId);
        this.indicesDom = document.getElementById(indicesId);
        
        // ★ 去除 'dark' 主题，恢复默认明亮风格
        this.statsChart = echarts.init(this.statsDom);
        this.indicesChart = echarts.init(this.indicesDom);
        
        this.miniPieCharts = [];
        this.activeChart = null; 
        this.activeType = null;

        this._initAutoResize();
        this._bindEvents(); 
    }

    _initAutoResize() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                window.requestAnimationFrame(() => {
                    if (entry.target === this.statsDom) this.statsChart.resize();
                    if (entry.target === this.indicesDom) this.indicesChart.resize();
                });
            }
            this.miniPieCharts.forEach(chart => chart.resize());
            
            const sankeyDom = document.getElementById('sankeyChart');
            if(sankeyDom) {
                const inst = echarts.getInstanceByDom(sankeyDom);
                if(inst) inst.resize();
            }
        });
        
        resizeObserver.observe(this.statsDom);
        resizeObserver.observe(this.indicesDom);
        
        const sidebarPanel = document.getElementById('sidebarPanel');
        if(sidebarPanel) resizeObserver.observe(sidebarPanel);
    }

    init() {
        this._loadStats();
        this._loadIndices(); 
    }

    setActive(type) {
        this.activeType = type;
        if (type === 'stats') {
            this.activeChart = this.statsChart;
        } else if (type === 'indices') {
            this.activeChart = this.indicesChart;
        } else {
            this.activeChart = null;
        }
    }

    switchType(type) {
        if (!this.activeChart) return;
        const oldOption = this.activeChart.getOption();
        if (!oldOption || !oldOption.series) return;
        
        const newSeries = oldOption.series.map(s => {
            return {
                type: type, name: s.name, data: s.data, itemStyle: s.itemStyle, stack: s.stack,
                areaStyle: (type === 'line' && s.stack) ? { opacity: 0.3 } : null,
                label: { show: false }
            };
        });
        this.activeChart.setOption({ series: newSeries });
    }

    restore() {
        if (this.activeType === 'stats') this._loadStats();
        else if (this.activeType === 'indices') this._loadIndices();
    }

    saveImage() {
        if (!this.activeChart) return;
        // ★ 导出图片时恢复白色背景
        const url = this.activeChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
        const link = document.createElement('a');
        link.href = url;
        link.download = 'chart_export.png';
        link.click();
    }

    // ==========================================
    // 1. 土地利用统计 (CSV) - 柱状图与饼图矩阵
    // ==========================================

    async _loadStats() {
        this.statsChart.showLoading();
        const data = await ApiService.getStatsData();
        this.statsChart.hideLoading();
        
        if(!data.years) return;

        const option = {
            tooltip: { trigger: 'axis', axisPointer: {type: 'shadow'} },
            legend: { top: 0, type: 'scroll' },
            grid: { left: '3%', right: '5%', bottom: '3%', top: '40px', containLabel: true },
            xAxis: { type: 'category', data: data.years },
            yAxis: { type: 'value', name: '面积 (ha)' },
            series: data.series.map(s => {
                let color = '#ccc';
                for(let k in CLASS_CONFIG) {
                    if(s.name.includes(CLASS_CONFIG[k].name)) color = CLASS_CONFIG[k].color;
                }
                return {
                    name: s.name, type: 'bar', stack: 'total',
                    emphasis: { focus: 'series' },
                    itemStyle: { color: color },
                    data: s.data
                };
            })
        };
        this.statsChart.setOption(option, true);
        this._renderPieGrid(data);
    }

    _renderPieGrid(data) {
        const container = document.getElementById('pieGrid');
        if (!container) return;
        container.innerHTML = ''; 
        this.miniPieCharts = [];  

        const years = data.years;
        const series = data.series;

        years.forEach((year, yearIndex) => {
            const pieData = [];
            series.forEach(s => {
                const value = s.data[yearIndex]; 
                let color = '#ccc';
                for(let k in CLASS_CONFIG) {
                    if(s.name.includes(CLASS_CONFIG[k].name)) color = CLASS_CONFIG[k].color;
                }
                if (value > 0) {
                    pieData.push({
                        value: value,
                        name: s.name.split(' ')[0], 
                        itemStyle: { color: color }
                    });
                }
            });

            const card = document.createElement('div');
            card.className = 'pie-card';
            
            const title = document.createElement('div');
            title.className = 'pie-year-title';
            title.innerText = year + '年';
            
            const chartDiv = document.createElement('div');
            chartDiv.className = 'mini-pie';
            
            card.appendChild(title);
            card.appendChild(chartDiv);
            container.appendChild(card);

            // ★ 去除 'dark' 主题
            const miniChart = echarts.init(chartDiv);
            const option = {
                tooltip: { trigger: 'item', formatter: '{b}: {d}%' }, 
                series: [
                    {
                        name: year + ' Land Use',
                        type: 'pie',
                        radius: ['40%', '70%'], 
                        avoidLabelOverlap: false,
                        label: { show: false, position: 'center' }, 
                        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
                        labelLine: { show: false },
                        data: pieData
                    }
                ]
            };
            miniChart.setOption(option);
            this.miniPieCharts.push(miniChart);
        });
    }

    // ==========================================
    // 2. 桑基图转移矩阵渲染 (全彩高颜版)
    // ==========================================

    async renderSankey(year1, year2) {
        const container = document.getElementById('sankeyChart');
        const chart = echarts.init(container);
        chart.showLoading();

        try {
            const data = await ApiService.getSankeyData(year1, year2);
            chart.hideLoading();

            if (data.error) {
                alert(data.error);
                return;
            }

            const validLinks = (data.links || []).filter(l => l.value > 0.01);
            const activeNodeNames = new Set();
            validLinks.forEach(l => {
                activeNodeNames.add(l.source);
                activeNodeNames.add(l.target);
            });

            // ★★★ 核心修复：为每个节点单独注入专属地物颜色 ★★★
            const validNodes = (data.nodes || []).filter(n => activeNodeNames.has(n.name)).map(n => {
                // 剥离前面的年份 (比如 "2000_水体" 变成 "水体")
                const nameParts = n.name.split('_');
                const realName = nameParts.length > 1 ? nameParts[1] : nameParts[0];
                
                // 查找对应的地物颜色
                let nodeColor = '#95a5a6'; // 默认灰色
                for(let k in CLASS_CONFIG) {
                    if(realName === CLASS_CONFIG[k].name) {
                        nodeColor = CLASS_CONFIG[k].color;
                        break;
                    }
                }
                
                return {
                    name: n.name,
                    // 1. 给节点方块涂上地物专属色
                    itemStyle: { color: nodeColor, borderColor: nodeColor },
                    // 2. 让文字只显示地物名称（去掉年份），并换上同款亮色
                    label: { 
                        formatter: realName, 
                        color: nodeColor, 
                        fontWeight: 'bold', 
                        fontSize: 14 
                    }
                };
            });

            if (validLinks.length === 0 || validNodes.length === 0) {
                chart.clear();
                chart.setOption({
                    title: { text: `${year1} → ${year2} 土地转移流向`, left: 'center', top: 5 },
                    graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '该时间段内无显著土地流转', fill: '#999', fontSize: 14 } }
                });
                return;
            }

            const option = {
                title: { text: `${year1} → ${year2} 土地转移流向`, left: 'center', top: 5, textStyle: {fontSize: 14, color: '#333'} },
                tooltip: { 
                    trigger: 'item', 
                    triggerOn: 'mousemove',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    // ★ 优化鼠标悬浮提示，清晰展示流转关系和面积
                    formatter: function (params) {
                        if (params.dataType === 'edge') {
                            const src = params.data.source.split('_')[1] || params.data.source;
                            const tgt = params.data.target.split('_')[1] || params.data.target;
                            return `<span style="color:#666">${src}</span> ➔ <span style="color:#333; font-weight:bold">${tgt}</span> <br/> 
                                    转移面积: <b style="color:#e74c3c">${params.data.value.toFixed(2)}</b> ha`;
                        }
                        const nodeName = params.name.split('_')[1] || params.name;
                        return `<b style="font-size:14px">${nodeName}</b>`;
                    }
                },
                series: [{
                    type: 'sankey',
                    emphasis: { focus: 'adjacency' },
                    data: validNodes,
                    links: validLinks,
                    top: 40, bottom: 20,
                    nodeWidth: 20,
                    nodeGap: 12,
                    layoutIterations: 32,
                    // ★ 开启 gradient：连线会吸取两端节点的颜色，产生极美的渐变过渡
                    lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.45 }
                }]
            };
            chart.setOption(option, true); 
        } catch (e) {
            chart.hideLoading();
            console.error("桑基图渲染失败:", e);
        }
    }

    // ==========================================
    // 3. GEE 动态点位演变折线图与 AI 悬浮窗
    // ==========================================

    _bindEvents() {
        window.addEventListener('renderPointSeries', (e) => {
            const data = e.detail;
            this.renderDynamicChart(data);
        });
    }

    renderDynamicChart(data) {
        const option = {
            title: { 
                text: '🎯 选中坐标点：历年生态演变推演', 
                // ★ 恢复普通的深色标题，去除阴影发光
                textStyle: {fontSize: 14, color: '#2c3e50'} 
            },
            tooltip: { 
                trigger: 'axis', 
                // ★ 恢复默认样式的 tooltip
                formatter: function(params) {
                    let yearIndex = params[0].dataIndex;
                    let year = data.years[yearIndex];
                    let lulc = data.LULC ? data.LULC[yearIndex] : '计算中...'; 
                    
                    const colorMap = {
                        '水体': '#1cece0', '植被': '#0db21f', '耕地': '#00ff00', 
                        '城镇': '#ff0000', '沙地': '#f0f015', '裸地': '#979a5d'
                    };
                    let lulcColor = colorMap[lulc] || '#ccc';

                    // 去除了 text-shadow，恢复清爽文本
                    let html = `<div style="font-weight:bold; margin-bottom:5px; font-size:14px; border-bottom:1px solid #ccc; padding-bottom:3px;">📅 ${year} 年</div>`;
                    html += `<div style="margin-bottom:8px; font-size:13px;">🌍 智能识别地类：<b style="color:${lulcColor}; font-size:14px;">${lulc}</b></div>`;
                    
                    params.forEach(p => {
                        html += `<div style="font-size:12px;">${p.marker} ${p.seriesName}: <span style="font-weight:bold">${parseFloat(p.value).toFixed(3)}</span></div>`;
                    });
                    return html;
                }
            },
            legend: { data: ['NDVI (植被)', 'BSI (荒漠化裸地)', 'MNDWI (水分)'], top: 30 },
            grid: { left: '8%', right: '5%', bottom: '10%', top: '70px', containLabel: true },
            xAxis: { 
                type: 'category', boundaryGap: false, data: data.years
            },
            yAxis: { 
                type: 'value', name: '指数值'
            },
            series: [
                {
                    name: 'NDVI (植被)', type: 'line', smooth: true, symbolSize: 6,
                    itemStyle: { color: '#27ae60' },
                    // ★ 去除 shadowColor 和 shadowBlur 霓虹滤镜
                    lineStyle: { width: 3 },
                    data: data.NDVI
                },
                {
                    name: 'BSI (荒漠化裸地)', type: 'line', smooth: true, symbolSize: 6,
                    itemStyle: { color: '#e67e22' },
                    // ★ 去除 shadowColor 和 shadowBlur 霓虹滤镜
                    lineStyle: { width: 3, type: 'dashed' },
                    data: data.BSI
                },
                {
                    name: 'MNDWI (水分)', type: 'line', smooth: true, symbolSize: 6,
                    itemStyle: { color: '#2980b9' },
                    // ★ 去除 shadowColor 和 shadowBlur 霓虹滤镜
                    lineStyle: { width: 2 },
                    data: data.MNDWI
                }
            ]
        };
        this.indicesChart.setOption(option, true);
    }

    // ==========================================
    // 4. (备用) 全区平均生态指标
    // ==========================================

    async _loadIndices() {
        this.indicesChart.showLoading();
        const data = await ApiService.getIndicesData();
        this.indicesChart.hideLoading();
        if(!data.years) return;

        const option = {
            title: { text: '全区生态指标平均值', textStyle: {fontSize: 14, color: '#7f8c8d'}, top: 0 },
            tooltip: { trigger: 'axis' },
            legend: { data: ['NDVI', 'FVC', 'Wetness'], top: 25 },
            grid: { left: '3%', right: '5%', bottom: '3%', top: '60px', containLabel: true },
            xAxis: { type: 'category', data: data.years, boundaryGap: false },
            yAxis: [
                { type: 'value', name: '指数', min: 0, max: 1, position: 'left' },
                { type: 'value', name: '湿度', position: 'right', splitLine: { show: false } }
            ],
            series: data.series.map(s => {
                const isWetness = s.name === 'Wetness';
                const color = isWetness ? '#2980b9' : (s.name==='FVC'?'#27ae60':'#2ecc71');
                return {
                    name: s.name, type: 'line', smooth: true,
                    yAxisIndex: isWetness ? 1 : 0,
                    itemStyle: { color: color },
                    // ★ 去除 shadow 发光滤镜
                    lineStyle: { width: 3, type: isWetness ? 'dashed' : 'solid' },
                    data: s.data
                };
            })
        };
        this.indicesChart.setOption(option, true);
    }

    // ==========================================
    // 5. 2030 预测数据接入
    // ==========================================

    async runPrediction(btn) {
        btn.innerHTML = "⏳ 计算中...";
        try {
            const res = await fetch('/api/predict');
            const pred = await res.json();
            btn.innerHTML = "✅ 完成";
            btn.style.background = "#27ae60";
            
            const option = this.indicesChart.getOption();
            const years = option.xAxis[0].data;
            if (years[years.length - 1] !== '2030') years.push('2030 (预测)');
            const series = option.series;
            
            series.forEach(s => {
                const p = pred.predictions[s.name.toUpperCase()];
                if(p) {
                    s.data.push(p.value);
                    // 恢复普通的红色标记
                    s.markPoint = { data: [{ value: parseFloat(p.value).toFixed(3), xAxis: years.length-1, yAxis: p.value, itemStyle:{color:'#e74c3c'} }] };
                }
            });
            this.indicesChart.setOption({ xAxis: {data: years}, series: series });
        } catch(e) { 
            btn.innerHTML = "❌ 失败"; 
            console.error("预测失败", e);
        }
    }
}