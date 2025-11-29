from tweety import Twitter


async def get_twitter_user_info():
    username = "Avery195201"
    print(123)
    app = Twitter(f".twitter_token/{username}")
    print(123)

    # Sign in to Twitter
    await app.sign_in(username=username, password="vfmbpoertoij3423fmbb")

    # Connect to Twitter
    await app.connect()

    # Get user info
    user = await app.get_user_info("gawrgura")

    print(user)
    return user


# To run this async function, you would need to use:
# asyncio.run(get_twitter_user_info())
# or within an async context:
# await get_twitter_user_info()
if __name__ == "__main__":
    import asyncio

    asyncio.run(get_twitter_user_info())
