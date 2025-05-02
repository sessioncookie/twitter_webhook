# 基於 Python 3.12.4 版本的映像
FROM python:3.12.4

# 設定工作目錄
WORKDIR /app

# 拷貝當前目錄的所有檔案到容器的 /app 目錄
COPY . /app

# 安裝依賴
RUN pip install --no-cache-dir -r requirements.txt

# 確保 Python 輸出不會被緩衝
ENV PYTHONUNBUFFERED=1

# 容器啟動時執行 uvicorn
CMD ["uvicorn", "twitter_webhook_api:app", "--host", "0.0.0.0", "--port", "25563"]
