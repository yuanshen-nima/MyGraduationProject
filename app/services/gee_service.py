import ee
from flask import current_app

class GEEService:
    def __init__(self):
        try:
            # 明确绑定你的项目 ID，解决权限报错
            ee.Initialize(project='gee-desertification-482512')
            print("✅ GEE 初始化成功！")
        except Exception as e:
            print("❌ GEE 初始化失败，请检查终端授权:", e)
            
        # 统一的研究区边界
        self.aoi = ee.Geometry.Rectangle([100.15, 38.75, 100.65, 39.05])
        # 任务书要求的时间节点
        self.years = [1995, 2000, 2005, 2010, 2015, 2020, 2023, 2025]

    def _add_indices(self, image):
        """计算各类生态指数"""
        ndvi = image.normalizedDifference(['NIR', 'Red']).rename('NDVI')
        ndbi = image.normalizedDifference(['SWIR1', 'NIR']).rename('NDBI')
        mndwi = image.normalizedDifference(['Green', 'SWIR1']).rename('MNDWI')
        
        evi = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
            {'NIR': image.select('NIR'), 'RED': image.select('Red'), 'BLUE': image.select('Blue')}
        ).rename('EVI')
        
        bsi = image.expression(
            '((SWIR2 + RED) - (NIR + BLUE)) / ((SWIR2 + RED) + (NIR + BLUE))',
            {'RED': image.select('Red'), 'BLUE': image.select('Blue'), 'NIR': image.select('NIR'), 'SWIR2': image.select('SWIR2')}
        ).rename('BSI')
        
        return image.addBands([ndvi, evi, ndbi, mndwi, bsi])

    def _get_imagery_for_year(self, year):
        """获取指定年份的影像，包含波段重命名与去云"""
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        if year >= 2013:
            col = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
                .filterBounds(self.aoi).filterDate(start_date, end_date) \
                .filter(ee.Filter.lt('CLOUD_COVER', 30))
            
            image = col.median().select(
                ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'],
                ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2']
            ).multiply(0.0000275).add(-0.2)
        else:
            col = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2') \
                .filterBounds(self.aoi).filterDate(start_date, end_date) \
                .filter(ee.Filter.lt('CLOUD_COVER', 30))
                
            image = col.median().select(
                ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'],
                ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2']
            ).multiply(0.0000275).add(-0.2)

        return self._add_indices(image).clip(self.aoi)

    def get_tile_url(self, year, index_type='NDVI'):
        """获取 GEE 瓦片地图 URL"""
        image = self._get_imagery_for_year(year)
        
        vis_params = {}
        if index_type == 'NDVI':
            # 植被指数：红->黄->绿
            vis_params = {'bands': ['NDVI'], 'min': -0.1, 'max': 0.8, 'palette': ['red', 'yellow', 'green']}
        elif index_type == 'BSI':
            # 裸地/荒漠化指数：绿->黄->红 (越红荒漠化越严重)
            vis_params = {'bands': ['BSI'], 'min': -0.2, 'max': 0.5, 'palette': ['green', 'yellow', 'red']}
        elif index_type == 'MNDWI':
            # 水体指数：白->蓝
            vis_params = {'bands': ['MNDWI'], 'min': -0.2, 'max': 0.4, 'palette': ['white', 'blue']}
            
        map_id_dict = ee.Image(image).getMapId(vis_params)
        return map_id_dict['tile_fetcher'].url_format

    def get_point_time_series(self, lat, lon):
        """获取指定坐标点的历年指数时间序列"""
        point = ee.Geometry.Point([lon, lat])
        
        series_data = {'years': self.years, 'NDVI': [], 'BSI': [], 'MNDWI': []}
        
        for year in self.years:
            image = self._get_imagery_for_year(year)
            stats = image.select(['NDVI', 'BSI', 'MNDWI']).reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=point,
                scale=30
            ).getInfo()
            
            # 安全获取数据，若为空则填 0
            series_data['NDVI'].append(stats.get('NDVI', 0) if stats.get('NDVI') is not None else 0)
            series_data['BSI'].append(stats.get('BSI', 0) if stats.get('BSI') is not None else 0)
            series_data['MNDWI'].append(stats.get('MNDWI', 0) if stats.get('MNDWI') is not None else 0)
            
        return series_data