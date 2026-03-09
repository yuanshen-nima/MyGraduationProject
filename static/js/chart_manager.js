import { CLASS_CONFIG } from './config.js';
import { ApiService } from './api.js';

export class ChartManager {
    constructor(statsId, indicesId) {
        this.statsDom = document.getElementById(statsId);
        this.indicesDom = document.getElementById(indicesId);
        
        this.statsChart = echarts.init(this.statsDom,'dark');
        this.indicesChart = echarts.init(this.indicesDom,'dark');
        
        this.miniPieCharts = [];
        this.activeChart = null; 
        this.activeType = null;

        this._initAutoResize();
        this._bindEvents(); // 绑定监听地图点击事件
    }

    _initAutoResize() {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                window.requestAnimationFrame(() => {
                    if (entry.target === this.statsDom) this.statsChart.resize();
                    if (entry.target === this.indicesDom) this.indicesChart.resize();
                });
            }
            // 让所有小饼图自适应
            this.miniPieCharts.forEach(chart => chart.resize());
            
            // 让桑基图自适应
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
        this._loadIndices(); // 初始加载全区平均指标
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

    // === 工具栏功能 ===
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

        // 渲染主柱状图
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

        // 渲染饼图矩阵
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
    // 2. 桑基图转移矩阵渲染 (修复空白Bug)
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

            const option = {
                title: { text: `${year1} → ${year2} 土地转移流向`, left: 'center', top: 5, textStyle: {fontSize: 14} },
                tooltip: { trigger: 'item', triggerOn: 'mousemove' },
                series: [{
                    type: 'sankey',
                    // ★ 删除了 layout: 'none'，让 ECharts 自动计算节点排版！
                    emphasis: { focus: 'adjacency' },
                    data: data.nodes,
                    links: data.links.filter(l => l.value > 0), // 过滤掉 0 值的无效连接
                    top: 40, bottom: 10,
                    nodeWidth: 20,
                    nodeGap: 8,
                    lineStyle: { color: 'gradient', curveness: 0.5 },
                    label: { color: '#333', fontSize: 12 },
                    itemStyle: {
                        color: (params) => {
                            // 安全解析节点颜色
                            if (!params.name) return '#ccc';
                            const nameParts = params.name.split('_');
                            const name = nameParts.length > 1 ? nameParts[1] : nameParts[0];
                            for(let k in CLASS_CONFIG) {
                                if(name === CLASS_CONFIG[k].name) return CLASS_CONFIG[k].color;
                            }
                            return '#ccc';
                        }
                    }
                }]
            };
            chart.setOption(option, true); 
        } catch (e) {
            chart.hideLoading();
            console.error("桑基图渲染失败:", e);
        }
    }
    // ==========================================
    // 3. GEE 动态点位演变折线图
    // ==========================================

    _bindEvents() {
        // 监听地图发出的 GEE 渲染事件
        window.addEventListener('renderPointSeries', (e) => {
            const data = e.detail;
            this.renderDynamicChart(data);
        });
    }

    renderDynamicChart(data) {
        const option = {
            title: { 
                text: '🎯 选中坐标点：历年生态演变推演', 
                textStyle: {fontSize: 14, color: '#e0e0e0'} 
            },
            tooltip: { trigger: 'axis' },
            legend: { data: ['NDVI (植被)', 'BSI (荒漠化裸地)', 'MNDWI (水分)'], top: 30 },
            grid: { left: '8%', right: '5%', bottom: '10%', top: '70px', containLabel: true },
            xAxis: { 
                type: 'category', 
                boundaryGap: false, 
                data: data.years 
            },
            yAxis: { type: 'value', name: '指数值' },
            series: [
                {
                    name: 'NDVI (植被)',
                    type: 'line',
                    smooth: true,
                    symbolSize: 8,
                    itemStyle: { color: '#27ae60' },
                    lineStyle: { width: 3 },
                    data: data.NDVI
                },
                {
                    name: 'BSI (荒漠化裸地)',
                    type: 'line',
                    smooth: true,
                    symbolSize: 8,
                    itemStyle: { color: '#e67e22' },
                    lineStyle: { width: 3, type: 'dashed' },
                    data: data.BSI
                },
                {
                    name: 'MNDWI (水分)',
                    type: 'line',
                    smooth: true,
                    symbolSize: 8,
                    itemStyle: { color: '#2980b9' },
                    lineStyle: { width: 2 },
                    data: data.MNDWI
                }
            ]
        };
        // 覆盖原本的平均指标图表
        this.indicesChart.setOption(option, true);
    }

    // (旧版备用) 全区平均指标加载
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
                return {
                    name: s.name, type: 'line', smooth: true,
                    yAxisIndex: isWetness ? 1 : 0,
                    itemStyle: { color: isWetness ? '#2980b9' : (s.name==='FVC'?'#27ae60':'#2ecc71') },
                    lineStyle: { width: 3, type: isWetness ? 'dashed' : 'solid' },
                    data: s.data
                };
            })
        };
        this.indicesChart.setOption(option, true);
    }

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
                    s.markPoint = { data: [{ value: p.value, xAxis: years.length-1, yAxis: p.value, itemStyle:{color:'red'} }] };
                }
            });
            this.indicesChart.setOption({ xAxis: {data: years}, series: series });
        } catch(e) { btn.innerHTML = "❌ 失败"; }
    }
}