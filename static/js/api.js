export class ApiService {
    // 1. 获取 CSV 统计数据 (面积柱状图/饼图)
    static async getStatsData() {
        const res = await fetch('/api/stats');
        return await res.json();
    }

    // 2. 获取全区平均生态指标
    static async getIndicesData() {
        const res = await fetch('/api/indices');
        return await res.json();
    }

    // 3. ★ 补回：获取 GeoJSON 矢量分类地图数据
    static async getMapData(year = 2022) {
        const res = await fetch(`/api/map?year=${year}`);
        return await res.json();
    }

    // 4. ★ 补回：获取 2030 年生态指标趋势预测
    static async getPrediction() {
        const res = await fetch('/api/predict');
        return await res.json();
    }

    // 5. 获取桑基图转移矩阵数据
    static async getSankeyData(year1, year2) {
        const res = await fetch(`/api/sankey?year1=${year1}&year2=${year2}`);
        return await res.json();
    }

    // 6. 获取 GEE 瓦片 URL (例如：NDVI 热力图)
    static async getGeeTileUrl(year, indexType) {
        const res = await fetch(`/api/gee/tile?year=${year}&index=${indexType}`);
        return await res.json();
    }

    // 7. 获取指定经纬度坐标点的 30年时间序列
    static async getGeePointSeries(lat, lon) {
        const res = await fetch(`/api/gee/point?lat=${lat}&lon=${lon}`);
        return await res.json();
    }
    // 8. ★ 新增：发送圈选多边形到后端计算面积
    static async getPolygonStats(geometry, year) {
        const res = await fetch('/api/gee/polygon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometry: geometry, year: year })
        });
        return await res.json();
    }
}