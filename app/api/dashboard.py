from flask import Blueprint, jsonify, request
from app.services.ecological_service import EcologicalService
from app.services.land_use_service import LandUseService
from app.services.gee_service import GEEService

bp = Blueprint('api', __name__, url_prefix='/api')

eco_service = EcologicalService()
land_service = LandUseService()
gee_service = GEEService()

@bp.route('/stats', methods=['GET'])
def get_stats():
    try:
        return jsonify(land_service.get_trend_data())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/indices', methods=['GET'])
def get_indices():
    try:
        return jsonify(eco_service.get_trend_data())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ★ 补回：获取 GeoJSON 地图接口
@bp.route('/map', methods=['GET'])
def get_map():
    try:
        year = request.args.get('year', default=2025, type=int)
        return jsonify(land_service.get_map_json(year))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ★ 补回：获取 2030 预测接口
@bp.route('/predict', methods=['GET'])
def predict_future():
    try:
        return jsonify(eco_service.predict_future(target_year=2030))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/sankey', methods=['GET'])
def get_sankey():
    try:
        y1 = request.args.get('year1', type=int)
        y2 = request.args.get('year2', type=int)
        return jsonify(land_service.get_sankey_data(y1, y2))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/gee/tile', methods=['GET'])
def get_gee_tile():
    try:
        year = request.args.get('year', default=2025, type=int)
        index_type = request.args.get('index', default='NDVI', type=str)
        tile_url = gee_service.get_tile_url(year, index_type)
        return jsonify({'url': tile_url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@bp.route('/gee/point', methods=['GET'])
def get_gee_point():
    try:
        lat = request.args.get('lat', type=float)
        lon = request.args.get('lon', type=float)
        if lat is None or lon is None:
            return jsonify({'error': '缺少坐标参数'}), 400
            
        # 1. 调用 gee_service 计算生态指数 (NDVI, BSI 等)
        data = gee_service.get_point_time_series(lat, lon)
        
        # 2. 调用 land_use_service 进行随机森林土地分类推演
        lulc_history = land_service.get_point_land_use_history(lat, lon, gee_service)
        
        # 3. 将地物分类合并进返回数据
        data['LULC'] = lulc_history
        
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@bp.route('/gee/polygon', methods=['POST'])
def get_gee_polygon_stats():
    """接收前端画出的多边形，返回该区域的地物统计"""
    try:
        data = request.json
        coords = data.get('geometry') # GeoJSON 坐标数组
        year = data.get('year', 2025)
        
        if not coords:
            return jsonify({'error': '缺少空间几何数据'}), 400
            
        # 调用刚才写好的统计方法
        stats = land_service.get_polygon_statistics(coords, year, gee_service)
        
        if isinstance(stats, dict) and 'error' in stats:
            return jsonify(stats), 500
            
        return jsonify({'stats': stats})
    except Exception as e:
        return jsonify({'error': str(e)}), 500