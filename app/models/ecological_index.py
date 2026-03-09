from app.extensions import db

class EcologicalIndex(db.Model):
    """生态指标表"""
    __tablename__ = 'ecological_indices'
    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, index=True)
    ndvi = db.Column(db.Float)
    fvc = db.Column(db.Float)
    wetness = db.Column(db.Float)

# ★★★ 新增：土地利用统计表 ★★★
class LandUseStats(db.Model):
    """土地利用面积统计表"""
    __tablename__ = 'land_use_stats'
    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, index=True)
    class_name = db.Column(db.String(50)) # 类别名称 (沙地、水体等)
    area = db.Column(db.Float)            # 面积