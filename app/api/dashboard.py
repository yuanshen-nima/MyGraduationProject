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
            
        data = gee_service.get_point_time_series(lat, lon)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500