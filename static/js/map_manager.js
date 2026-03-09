import { CLASS_CONFIG } from './config.js';
import { ApiService } from './api.js';

export class MapManager {
    constructor(mapId, legendId) {
        this.mapId = mapId;
        this.legendId = legendId;
        this.map = null;
        
        // LULC 矢量图层相关
        this.layerGroups = {}; 
        this.layerControl = null;
        this.availableYears = [2000, 2010, 2020, 2022, 2025];
        this.currentYear = 2025;
        this.swipeControl = null; 
        
        // GEE 实时瓦片图层相关
        this.currentGeeLayer = null;
        this.currentGeeIndex = 'None'; // 默认不显示叠加层，可选 'NDVI', 'BSI'
    }

    init() {
        // 1. 初始化地图基础设置
        this.map = L.map(this.mapId, {zoomControl: false, attributionControl: false}).setView([38.9, 100.4], 9);
        L.control.zoom({position: 'topleft'}).addTo(this.map);

        // ★★★ 换回浅色(白色)底图 ★★★
        const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {maxZoom: 18});
        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 17});
        
        street.addTo(this.map); // 默认加载浅色底图

        for (let key in CLASS_CONFIG) {
            const name = CLASS_CONFIG[key].name;
            this.layerGroups[name] = L.layerGroup().addTo(this.map);
        }

        // 修改图层控制器的名称，并去掉暗黑模式下的文字阴影
        const baseMaps = { "街道地图 (Light)": street, "卫星影像": satellite };
        const overlayMaps = {};
        for (let key in CLASS_CONFIG) {
            const cfg = CLASS_CONFIG[key];
            // 去掉了暗黑模式特有的 text-shadow，让文字在白底图上更清晰
            const label = `<span style="color:${cfg.color}; font-size:14px;">■</span> ${cfg.name}`;
            overlayMaps[label] = this.layerGroups[cfg.name];
        }
        this.layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false, position: 'topright' }).addTo(this.map);

        this._addCustomControls();
        this._renderLegend();
        this._loadLulcData(this.currentYear);
        
        // 5. ★★★ 核心交互：地图点击触发 GEE 云端时序计算 ★★★
        this.map.on('click', async (e) => {
            const lat = e.latlng.lat;
            const lon = e.latlng.lng;
            
            // 添加标记和加载提示
            if(this.marker) this.map.removeLayer(this.marker);
            this.marker = L.marker([lat, lon]).addTo(this.map)
                           .bindPopup("<div style='text-align:center;'><i class='fa-solid fa-spinner fa-spin'></i><br>正在连接 GEE 云端<br>计算该点 30 年生态演变数据...</div>")
                           .openPopup();

            try {
                // 调用后端 API，让 GEE 实时算数据
                const data = await ApiService.getGeePointSeries(lat, lon);
                
                if (data.error) throw new Error(data.error);

                this.marker.setPopupContent(`
                    <div style='font-size:13px;'>
                        <b>📍 坐标定位成功</b><br>
                        经度: ${lon.toFixed(4)}<br>
                        纬度: ${lat.toFixed(4)}<br>
                        <span style='color:#27ae60; font-weight:bold;'>✅ 计算完成！请查看左侧面板趋势图。</span>
                    </div>
                `);
                
                // 派发事件，通知 ChartManager 渲染折线图
                window.dispatchEvent(new CustomEvent('renderPointSeries', { detail: data }));
                
                // 自动打开侧边栏的“生态指标分析”面板 (幼苗图标)
                const indicesTab = document.querySelector('.nav-item[data-target="indices"]');
                if(indicesTab) indicesTab.click();
                
            } catch (err) {
                console.error("GEE计算失败:", err);
                this.marker.setPopupContent("<b style='color:#c0392b;'>❌ 计算失败</b><br>可能是网络超时或权限不足。");
            }
        });
    }

    _addCustomControls() {
        const ControlPanel = L.Control.extend({
            options: { position: 'topright' },
            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'year-control leaflet-bar');
                container.style.backgroundColor = 'white';
                container.style.padding = '8px 12px';
                container.style.marginTop = '10px';
                container.style.borderRadius = '5px';
                container.style.boxShadow = '0 1px 5px rgba(0,0,0,0.4)';
                container.style.fontSize = '13px';
                container.style.fontWeight = 'bold';
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '8px';
                
                // 年份选择 (用于矢量分类图)
                let html = `<div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>📅 分类年份: </span>
                                <select id="ctrlYear" style="padding:3px; border-radius:3px;">`;
                this.availableYears.forEach(y => {
                    html += `<option value="${y}" ${y === this.currentYear ? 'selected' : ''}>${y}年</option>`;
                });
                html += `       </select>
                            </div>`;
                
                // GEE 瓦片图层选择 (沙化/植被指数)
                html += `<div style="display:flex; justify-content:space-between; align-items:center;">
                            <span>🌐 GEE 叠加层: </span>
                            <select id="ctrlIndex" style="padding:3px; border-radius:3px; max-width:110px;">
                                <option value="None" selected>关闭叠加</option>
                                <option value="BSI">BSI (沙化分布)</option>
                                <option value="NDVI">NDVI (植被覆盖)</option>
                                <option value="MNDWI">MNDWI (水体分布)</option>
                            </select>
                         </div>`;

                container.innerHTML = html;
                L.DomEvent.disableClickPropagation(container);
                return container;
            }
        });
        
        this.map.addControl(new ControlPanel());

        // 绑定事件
        setTimeout(() => {
            const selYear = document.getElementById('ctrlYear');
            const selIndex = document.getElementById('ctrlIndex');
            
            selYear.addEventListener('change', (e) => {
                if (this.swipeControl) {
                    alert("请先在左侧面板退出卷帘模式！");
                    selYear.value = this.currentYear; // 恢复下拉框显示
                    return; 
                }
                this.currentYear = parseInt(e.target.value);
                this._loadLulcData(this.currentYear);
                // 同步刷新 GEE 瓦片
                if (this.currentGeeIndex !== 'None') {
                    this._loadGeeTileLayer(this.currentYear, this.currentGeeIndex);
                }
            });

            selIndex.addEventListener('change', (e) => {
                this.currentGeeIndex = e.target.value;
                this._loadGeeTileLayer(this.currentYear, this.currentGeeIndex);
            });
        }, 500);
    }

    _renderLegend() {
        let html = '<h4>地物分类图例</h4>';
        for(let key in CLASS_CONFIG) {
            html += `<div class="legend-item"><div class="color-box" style="background:${CLASS_CONFIG[key].color}"></div>${CLASS_CONFIG[key].name}</div>`;
        }
        const legendBox = document.getElementById(this.legendId);
        if(legendBox) legendBox.innerHTML = html;
    }

    // ==========================================
    // 数据加载逻辑
    // ==========================================

    async _loadLulcData(year) {
        console.log(`>>> 加载 ${year} 年 LULC 矢量数据...`);
        for (let name in this.layerGroups) this.layerGroups[name].clearLayers();
        try {
            const data = await ApiService.getMapData(year);
            if(data.error || !data.features) return;
            L.geoJSON(data, {
                style: this._getStyle,
                onEachFeature: (feature, layer) => {
                    const type = feature.properties.label;
                    const cfg = CLASS_CONFIG[type];
                    if (cfg) this.layerGroups[cfg.name].addLayer(layer);
                }
            });
        } catch (err) { console.error("矢量加载失败:", err); }
    }

    async _loadGeeTileLayer(year, indexType) {
        if (this.currentTileLayer) {
            this.map.removeLayer(this.currentTileLayer);
            this.currentTileLayer = null;
        }
        
        if (indexType === 'None') return;

        console.log(`>>> 加载 ${year} 年 GEE 瓦片: ${indexType}`);
        try {
            const data = await ApiService.getGeeTileUrl(year, indexType);
            if (data.url) {
                // 确保瓦片层级最高，能覆盖在底图之上
                if (!this.map.getPane('geePane')) {
                    this.map.createPane('geePane');
                    this.map.getPane('geePane').style.zIndex = 450;
                }
                
                this.currentTileLayer = L.tileLayer(data.url, {
                    maxZoom: 18,
                    opacity: 0.75, // 75%透明度，透出底部的 LULC 矢量分类或地形
                    pane: 'geePane'
                }).addTo(this.map);
            }
        } catch (err) {
            console.error("GEE 瓦片加载失败:", err);
        }
    }

// ==========================================
    // 卷帘模式逻辑 (终极透明瓦片欺骗法)
    // ==========================================

    async toggleSwipeMode(yearLeft, yearRight, enable) {
        // 1. 清理全部残余
        if (this.swipeControl) {
            this.swipeControl.remove();
            this.swipeControl = null;
        }
        if (this.mockLeft) this.mockLeft.remove();
        if (this.mockRight) this.mockRight.remove();
        if (this.leftGeoJSON) this.leftGeoJSON.remove();
        if (this.rightGeoJSON) this.rightGeoJSON.remove();
        
        if (this._clipPanes) {
            this.map.off('move', this._clipPanes);
            this.map.off('resize', this._clipPanes);
            this.map.off('zoom', this._clipPanes);
        }

        const leftPane = this.map.getPane('swipeLeftPane');
        const rightPane = this.map.getPane('swipeRightPane');
        if (leftPane) leftPane.style.clip = '';
        if (rightPane) rightPane.style.clip = '';

        for (let name in this.layerGroups) this.layerGroups[name].clearLayers();

        if (!enable) {
            this._loadLulcData(yearRight);
            return;
        }

        console.log(`>>> 启动矢量卷帘: 左${yearLeft} vs 右${yearRight}`);

        try {
            const dataLeft = await ApiService.getMapData(yearLeft);
            const dataRight = await ApiService.getMapData(yearRight);

            if (!dataLeft.features || !dataRight.features) {
                alert(`数据加载异常：找不到 ${yearLeft} 或 ${yearRight} 的矢量地图数据！`);
                return;
            }

            if (!this.map.getPane('swipeLeftPane')) this.map.createPane('swipeLeftPane');
            if (!this.map.getPane('swipeRightPane')) this.map.createPane('swipeRightPane');
            
            this.map.getPane('swipeLeftPane').style.zIndex = 400;
            this.map.getPane('swipeRightPane').style.zIndex = 400;

            this.leftGeoJSON = L.geoJSON(dataLeft, { style: this._getStyle, pane: 'swipeLeftPane' }).addTo(this.map);
            this.rightGeoJSON = L.geoJSON(dataRight, { style: this._getStyle, pane: 'swipeRightPane' }).addTo(this.map);

            // ★★★ 核心突破：创建真正的透明瓦片作为替身交给插件，绝对不报错！
            const emptyTile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            this.mockLeft = L.tileLayer(emptyTile).addTo(this.map);
            this.mockRight = L.tileLayer(emptyTile).addTo(this.map);

            this.swipeControl = L.control.sideBySide(this.mockLeft, this.mockRight);
            this.swipeControl.addTo(this.map);

            this._clipPanes = () => {
                if (!this.swipeControl) return;
                const nw = this.map.containerPointToLayerPoint([0, 0]);
                const se = this.map.containerPointToLayerPoint(this.map.getSize());
                const clipX = nw.x + this.swipeControl.getPosition(); 
                
                const clipLeft = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
                const clipRight = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
                
                if(this.map.getPane('swipeLeftPane')) this.map.getPane('swipeLeftPane').style.clip = clipLeft;
                if(this.map.getPane('swipeRightPane')) this.map.getPane('swipeRightPane').style.clip = clipRight;
            };

            this.swipeControl.on('dividermove', this._clipPanes);
            this.map.on('move', this._clipPanes);
            this.map.on('resize', this._clipPanes);
            this.map.on('zoom', this._clipPanes);

            setTimeout(this._clipPanes, 50);

        } catch (e) {
            console.error("卷帘启动失败:", e);
            alert("卷帘加载失败，请检查数据。");
        }
    }

    _getStyle(feature) {
        const type = feature.properties.label;
        const cfg = CLASS_CONFIG[type];
        return { color: cfg ? cfg.color : '#ccc', weight: 0, fillOpacity: 0.85 };
    }

    resize() { 
        if(this.map) this.map.invalidateSize(); 
    }
}