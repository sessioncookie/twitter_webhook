import requests

webhook_url = "https://discord.com/api/webhooks/1367926873174311022/zLjX0RoTOV_9aq80WP1taeoMt-tEw_cupTgG_12TtvuQ8lm2hwyvqcyOvC5hV77Ul2Mr"
test_message = {"content": "測試訊息"}
try:
    response = requests.post(webhook_url, json=test_message, timeout=5)
    if response.status_code not in (200, 204):
        print({"message": f"Webhook 測試訊息發送失敗，狀態碼: {response.status_code}"})
except requests.exceptions.RequestException as e:
    print({"message": f"Webhook 測試訊息發送失敗，錯誤: {e}"})