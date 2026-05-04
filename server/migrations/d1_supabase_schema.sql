CREATE TABLE IF NOT EXISTS tb_ma_template_prompt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator TEXT NOT NULL,
    source TEXT NOT NULL,
    origin_text TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    owner TEXT NOT NULL,
    publish_time TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tb_ma_template_prompt_created_at ON tb_ma_template_prompt(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_ma_template_prompt_owner ON tb_ma_template_prompt(owner);

CREATE TABLE IF NOT EXISTS tweet_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT NOT NULL UNIQUE,
    tweet_url TEXT,
    tweet_created_at TEXT,
    tweet_replay TEXT,
    user_id TEXT,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_tweet_info_user_id ON tweet_info(user_id);

CREATE TABLE IF NOT EXISTS retweet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tid TEXT NOT NULL UNIQUE,
    mid TEXT,
    tweet_id TEXT,
    retweet_info TEXT,
    lang TEXT DEFAULT 'default',
    ctime TEXT,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_retweet_tweet_id ON retweet(tweet_id);
CREATE INDEX IF NOT EXISTS idx_retweet_mid ON retweet(mid);

CREATE TABLE IF NOT EXISTS tweet_card (
    uid TEXT PRIMARY KEY,
    id TEXT,
    user_id TEXT,
    card_html TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'uper',
    user_cookie TEXT,
    ctime TEXT DEFAULT CURRENT_TIMESTAMP,
    mtime TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tweet_card_user_id ON tweet_card(user_id);
CREATE INDEX IF NOT EXISTS idx_tweet_card_story_lookup ON tweet_card(id, card_type, ctime DESC);

CREATE TABLE IF NOT EXISTS tweeter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    user_name TEXT,
    nick_name TEXT,
    description TEXT,
    profile_picture TEXT,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    created_at TEXT,
    statuses_count INTEGER DEFAULT 0,
    profile_banner_url TEXT,
    is_star INTEGER DEFAULT 0,
    mtime TEXT
);
CREATE INDEX IF NOT EXISTS idx_tweeter_is_star_followers ON tweeter(is_star, followers DESC);

CREATE TABLE IF NOT EXISTS user_lastest_tweet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tweet_id TEXT NOT NULL,
    tweet_url TEXT,
    text TEXT,
    created_at TEXT,
    author TEXT,
    extended_entities TEXT,
    card TEXT,
    entities TEXT,
    quote_count INTEGER DEFAULT 0,
    favorite_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    entry TEXT,
    view_count INTEGER DEFAULT 0,
    UNIQUE(user_id, tweet_id)
);
CREATE INDEX IF NOT EXISTS idx_user_lastest_tweet_user_created_at ON user_lastest_tweet(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS x_crawl_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL UNIQUE,
    status TEXT,
    message TEXT,
    mtime TEXT
);

CREATE TABLE IF NOT EXISTS xiaohongshu_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT NOT NULL UNIQUE,
    tweet_url TEXT,
    title TEXT,
    time TEXT,
    description TEXT,
    images_list TEXT,
    mtime TEXT
);

CREATE TABLE IF NOT EXISTS xiaohongshu_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    red_id TEXT NOT NULL UNIQUE,
    nickname TEXT,
    userid TEXT,
    image TEXT,
    name TEXT,
    mtime TEXT
);

CREATE TABLE IF NOT EXISTS media_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tweet_id TEXT,
    media_url TEXT,
    media_type TEXT,
    filename TEXT,
    file_size INTEGER,
    downloaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_downloads_tweet_id ON media_downloads(tweet_id);
