import os
import sys

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

if sys.platform.startswith('win'):
    db_path = os.path.join(BASE_DIR, 'desert.db').replace('\\', '/')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_path}'
else:
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(BASE_DIR, 'desert.db')

class Config:
    SECRET_KEY = 'grad-project-secret-key'
    SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # 生态指标数据 (CSV)
    CSV_PATH = os.path.join(BASE_DIR, 'static/data/Heihe_Ecological_Indices_Mean_1995_2025.csv')
    
    # 地图数据 (GeoJSON)
    MAP_PATH = os.path.join(BASE_DIR, 'static/data/map.geojson')
    
    # ★★★ 必须加上这一行：土地利用统计数据 (即原来的 data.csv) ★★★
    STATS_PATH = os.path.join(BASE_DIR, 'static/data/data.csv')