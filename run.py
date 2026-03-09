from app import create_app

app = create_app()

if __name__ == '__main__':
    print("--- 荒漠化监测系统启动 ---")
    app.run(debug=True, port=5000)