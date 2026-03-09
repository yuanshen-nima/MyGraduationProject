from flask import Flask, render_template
from config import Config
from app.extensions import db
from app.api.dashboard import bp as api_bp

def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    app.config.from_object(Config)

    db.init_app(app)
    app.register_blueprint(api_bp)

    @app.route('/')
    def index():
        return render_template('index.html')

    with app.app_context():
        db.create_all()
        
        # --- 使用重构后的服务进行初始化 ---
        print(">>> 系统启动，正在初始化各领域数据...")
        from app.services.ecological_service import EcologicalService
        from app.services.land_use_service import LandUseService
        
        # 多态调用的体现：都调用 import_data，但行为不同
        EcologicalService().import_data()
        LandUseService().import_data()
        # -------------------------------

    return app