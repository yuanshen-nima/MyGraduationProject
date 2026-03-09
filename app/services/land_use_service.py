import json
import os
import re
import ee
from flask import current_app
from app.services.base_service import BaseDataService

# 匹配 GEE 导出的类别 ID
CLASS_NAMES = {1: '水体', 2: '植被', 3: '耕地', 4: '城镇', 5: '沙地', 6: '裸地'}

class LandUseService(BaseDataService):
    def __init__(self):
        self._classifier = None
        self._cached_data = None  

    def import_data(self):
        pass 

    def _read_csv_data(self):
        """🎯 终极优雅版：直接读取 config.py 中的 STATS_PATH 配置，并进行正则暴力解析"""
        if self._cached_data is not None:
            return self._cached_data

        # ★★★ 核心：直接从 Flask 配置读取你写好的绝对路径 ★★★
        csv_path = current_app.config.get('STATS_PATH')
            
        if not csv_path or not os.path.exists(csv_path):
            print(f"❌ 找不到文件！系统去寻找的绝对路径是: {csv_path}")
            return []
            
        data = []
        print(f"✅ 精准定位并读取配置的数据文件: {csv_path}")
        
        try:
            # 使用 utf-8-sig 无视不可见乱码，按普通文本读取每一行
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                lines = f.readlines()
                
            for line in lines:
                line = line.strip()
                # 如果这行是空的，或者开头不是数字（比如表头 "year"），直接跳过
                if not line or not line[0].isdigit():
                    continue
                    
                # 提取行首的年份数字 (比如 "1995")
                year_match = re.match(r'^(\d{4})', line)
                if not year_match: continue
                year = int(year_match.group(1))
                
                # 正则扫描整行，完美提取你提供的 GEE 格式数据
                matches = re.findall(r'class=(\d+),\s*sum=([0-9.]+)', line)
                
                for m in matches:
                    class_id = int(m[0])
                    area = float(m[1])
                    class_name = CLASS_NAMES.get(class_id, '未知')
                    
                    data.append({
                        'year': year,
                        'class_name': class_name,
                        'area': area
                    })
            
            self._cached_data = data
            print(f"🎉 解析成功！共提取到 {len(data)} 条面积记录。")
            return data
            
        except Exception as e:
            print(f"❌ 解析失败: {e}")
            return []

    def get_trend_data(self):
        all_data = self._read_csv_data()
        if not all_data: return {'years': [], 'series': []}
        
        years = sorted(list(set([d['year'] for d in all_data])))
        class_names = set([d['class_name'] for d in all_data])
        
        series_map = {name: {y: 0 for y in years} for name in class_names}
        for d in all_data: 
            series_map[d['class_name']][d['year']] += d['area']
            
        return {
            'years': years, 
            'series': [{'name': n, 'type': 'line', 'data': [v[y] for y in years]} for n, v in series_map.items()]
        }
        
    def get_map_json(self, year=2025):
        data_dir = os.path.dirname(current_app.config['MAP_PATH'])
        if year == 2022: filename = 'map.geojson'
        else: filename = f'LULC_WebGIS_{year}.geojson'
        file_path = os.path.join(data_dir, filename)
        if not os.path.exists(file_path):
            file_path = current_app.config['MAP_PATH']
            if not os.path.exists(file_path): return {}
        try:
            with open(file_path, 'r', encoding='utf-8') as f: return json.load(f)
        except Exception as e: return {}

    def get_sankey_data(self, year_start, year_end):
        all_data = self._read_csv_data()
        
        map_start = {d['class_name']: d['area'] for d in all_data if d['year'] == year_start}
        map_end = {d['class_name']: d['area'] for d in all_data if d['year'] == year_end}
        
        if not map_start or not map_end: 
            return {'error': f'缺少 {year_start} 或 {year_end} 年的数据，请检查 CSV'}

        nodes, links = [], []
        categories = CLASS_NAMES.values()
        
        for name in categories: nodes.append({'name': f"{year_start}_{name}"})
        for name in categories: nodes.append({'name': f"{year_end}_{name}"})

        decreased_classes, increased_classes, unchanged_flow = {}, {}, []
        for name in categories:
            area1, area2 = map_start.get(name, 0), map_end.get(name, 0)
            kept_area = min(area1, area2)
            if kept_area > 0:
                unchanged_flow.append({'source': f"{year_start}_{name}", 'target': f"{year_end}_{name}", 'value': kept_area})
            
            diff = area2 - area1
            if diff > 0: increased_classes[name] = diff
            elif diff < 0: decreased_classes[name] = abs(diff)

        total_increase = sum(increased_classes.values())
        if total_increase > 0:
            for dec_name, dec_amount in decreased_classes.items():
                for inc_name, inc_amount in increased_classes.items():
                    weight = inc_amount / total_increase
                    links.append({'source': f"{year_start}_{dec_name}", 'target': f"{year_end}_{inc_name}", 'value': dec_amount * weight})
        
        links.extend(unchanged_flow)
        return {'nodes': nodes, 'links': links}

    # ==========================================================
    # ★★★ GEE 随机森林点位动态分类 (保持不变) ★★★
    # ==========================================================
    def _get_classifier(self, gee_service):
        if self._classifier is not None:
            return self._classifier
        print(">>> 正在初始化 GEE 随机森林分类器 (首次加载可能需要几秒)...")
        water = ee.FeatureCollection('projects/gee-desertification-482512/assets/Heihe_Midstream_ESA_Sampleswater')
        cultivations = ee.FeatureCollection('users/2956415426/Heihe_Training_Dataset_v1cultivations')
        vegetations = ee.FeatureCollection('users/2956415426/Heihe_Midstream_ESA_Samplesvegetation')
        urban = ee.FeatureCollection('users/2956415426/Heihe_Midstream_ESA_Samplesurban')
        sand = ee.FeatureCollection('users/2956415426/Heihe_Training_Dataset_v1sand')
        bare = ee.FeatureCollection('users/2956415426/Heihe_Training_Dataset_v1bare')
        
        sample = water.merge(cultivations).merge(vegetations).merge(urban).merge(sand).merge(bare)
        ref_image = gee_service._get_imagery_for_year(2023)
        train_sample = ref_image.sampleRegions(collection=sample, properties=['class'], scale=30, tileScale=4)
        
        self._classifier = ee.Classifier.smileRandomForest(100).train(features=train_sample, classProperty='class', inputProperties=ref_image.bandNames())
        print("✅ GEE 随机森林分类器训练完毕！")
        return self._classifier

    def get_point_land_use_history(self, lat, lon, gee_service):
        try:
            point = ee.Geometry.Point([lon, lat])
            classifier = self._get_classifier(gee_service)
            features_list = []
            for year in gee_service.years:
                img = gee_service._get_imagery_for_year(year)
                classified = img.classify(classifier).rename('LULC')
                val = classified.reduceRegion(reducer=ee.Reducer.first(), geometry=point, scale=30)
                feat = ee.Feature(None, {'year': year, 'LULC': val.get('LULC')})
                features_list.append(feat)
                
            features = ee.FeatureCollection(features_list)
            info = features.getInfo()
            
            results = []
            for f in info['features']:
                c_val = f['properties'].get('LULC')
                results.append(CLASS_NAMES.get(int(c_val), '未知') if c_val is not None else '无数据')
            return results
        except Exception as e:
            print(f"❌ 点位 LULC 分类失败: {e}")
            return ['计算异常'] * len(gee_service.years)
    def get_polygon_statistics(self, coords, year, gee_service):
        """核心能力：接收前端画的圈(多边形)，调用 GEE 计算圈内各类地物面积占比"""
        try:
            # 1. 构造 GEE 的多边形几何体
            polygon = ee.Geometry.Polygon(coords)
            
            # 2. 获取分类器和该年份的影像并进行分类
            classifier = self._get_classifier(gee_service)
            img = gee_service._get_imagery_for_year(year)
            classified = img.classify(classifier).rename('LULC')
            
            # 3. 计算圈选区域内的面积 (公顷)
            area_image = ee.Image.pixelArea().divide(10000).addBands(classified)
            stats = area_image.reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName='class_id'),
                geometry=polygon,
                scale=30,
                maxPixels=1e9,
                tileScale=4
            ).getInfo()
            
            # 4. 组装返回数据
            results = []
            if 'groups' in stats:
                for g in stats['groups']:
                    c_id = int(g['class_id'])
                    area = g['sum']
                    c_name = CLASS_NAMES.get(c_id, '未知')
                    results.append({'name': c_name, 'value': round(area, 2)})
                    
            return results
        except Exception as e:
            print(f"❌ 圈选区域计算失败: {e}")
            return {'error': str(e)}