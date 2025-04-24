import aiomysql
from tweety import Twitter
from tweety.exceptions import TwitterError
from dotenv import load_dotenv
import asyncio
import os
import redis.asyncio as redis
from dateutil import parser
from typing import Optional
import aiohttp
import json
from typing import Union
from datetime import datetime


load_dotenv(dotenv_path=".env")

DB_HOST = os.getenv("TWITTER_DB_HOST")
DB_PORT = int(os.getenv("TWITTER_DB_PORT"))
UDB_USERSER = os.getenv("TWITTER_DB_USER")
DB_PASSWORD = os.getenv("TWITTER_DB_PASSWORD")
DB_DATABASE = os.getenv("TWITTER_DB_DATABASE")
TWITTER_REDIS_URL = os.getenv("DOCKER_TWITTER_REDIS_URL")
TWITTER_REDIS_MAX_CONNECTIONS = os.getenv("TWITTER_DB_DATABASE")
username_dict = json.loads(os.getenv("username_dict"))

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")  # 預設值為本地 Redis
redis_max_connections = int(os.getenv("REDIS_MAX_CONNECTIONS", "10"))
pool = redis.ConnectionPool.from_url(redis_url, max_connections=redis_max_connections)
redis_client = redis.Redis(connection_pool=pool)


async def create_pool():
    try:
        pool = await aiomysql.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            user=UDB_USERSER,
            password=DB_PASSWORD,
            db=DB_DATABASE,
            minsize=1,
            maxsize=10,
            charset="utf8mb4",
            loop=asyncio.get_event_loop(),
        )
        print("連線池建立成功")
        return pool
    except aiomysql.Error as e:
        print(f"連線池建立失敗: {e}")
        return None


async def fetch_with_pool(pool):
    async with pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                "SELECT id,follow_user,webhook_url,notify FROM follow_data WHERE data < NOW()"
            )
            results = await cursor.fetchall()
            return results


async def twitter(
    target_username,
    TWITTER_username: str = "0",
    TWITTER_password: str = "0",
):
    try:
        token_path = f".twitter_token/{TWITTER_username}"
        app = Twitter(token_path)
        if not os.path.exists(token_path):
            await app.sign_in(username=TWITTER_username, password=TWITTER_password)
        # await app.sign_in(username="ilovetweey57203", password="vfmbpoertoij3423fmbb")
        await app.connect()

        # 嘗試獲取用戶資訊
        try:
            user = await app.get_user_info(target_username)
        except TwitterError as e:
            print(f"Error fetching user info: {e}")
            return  # 如果無法獲取用戶資訊，跳過此次輪詢

        # 嘗試獲取推文
        try:
            all_tweets = await app.get_tweets(user)
            if hasattr(all_tweets, "tweets"):
                for tweet in all_tweets.tweets:
                    if not tweet.is_retweet:
                        return tweet.url, tweet.created_on
            else:
                if not all_tweets.is_retweet:
                    return all_tweets.url, all_tweets.created_on
        except TwitterError as e:
            print(f"Error fetching tweets: {e}")
            return  # 如果無法獲取推文，跳過此次輪詢

    except Exception as e:
        print(f"Unexpected error in Twitter task: {e}")


REDIS_KEY = "twitter:last_tweet_time"


async def twitter_and_redis(username: str, time: Union[str, datetime]) -> bool:
    if isinstance(time, str):
        new_time = parser.parse(time)
    else:
        new_time = time

    old_time_str: Optional[str] = await redis_client.hget(REDIS_KEY, username)

    if old_time_str is None:
        # 轉成 ISO 格式字串再存進 Redis
        await redis_client.hset(REDIS_KEY, username, new_time.isoformat())
        return True

    old_time = parser.parse(old_time_str)

    if old_time < new_time:
        await redis_client.hset(REDIS_KEY, username, new_time.isoformat())
        return True
    else:
        return False


async def message_to_webhook(message: str, webhook_url: str) -> bool:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(webhook_url, json={"content": message}) as resp:
                if resp.status == 200 or resp.status == 204:
                    return True
                else:
                    print(f"⚠️ Webhook 回應狀態碼: {resp.status}")
                    return False
        except aiohttp.ClientError as e:
            print(f"❌ 發送 webhook 時發生錯誤: {e}")
            return False


async def main():
    pool = await create_pool()
    followers = [[username, token] for username, token in username_dict.items()]
    if pool:
        follow_data = await fetch_with_pool(pool)
        pool.close()
        await pool.wait_closed()

        for data in follow_data:
            tw_url, tw_time = await twitter(
                target_username=data[1],
                TWITTER_username=followers[len(followers) % int(data[0])][0],
                TWITTER_password=followers[len(followers) % int(data[0])][1],
            )
            if await twitter_and_redis(data[1], tw_time):
                await message_to_webhook(message=data[3] + f"\n{tw_url}", webhook_url=data[2])


if __name__ == "__main__":
    asyncio.run(main())
