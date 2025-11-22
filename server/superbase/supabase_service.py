#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import logging
import time
import ssl
import requests
from typing import Optional
from supabase import create_client, Client
from postgrest.exceptions import APIError
from .config import Config
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('supabase_service')

class SupabaseService:
    """Supabase数据库服务类，提供与Supabase的数据库操作功能"""
    
    _client = None
    
    @classmethod
    def reset_connection(cls):
        """重置Supabase连接，用于处理连接问题"""
        cls._client = None
        logger.info("已重置Supabase连接")
        return cls.get_client()
    
    @classmethod
    def get_client(cls) -> Client:
        """获取Supabase客户端连接"""
        if cls._client is None:
            retry_count = 0
            max_retries = Config.SUPABASE_MAX_RETRIES
            retry_delay = Config.SUPABASE_RETRY_DELAY  # 初始重试延迟（秒）
            
            while retry_count < max_retries:
                try:
                    url = Config.SUPABASE_URL
                    key = Config.SUPABASE_KEY
                    
                    if not url or not key:
                        logger.error("Supabase URL或KEY不能为空")
                        raise ValueError("Supabase URL或KEY不能为空")
                    
                    # 使用标准的Supabase客户端初始化方法
                    cls._client = create_client(url, key)
                    logger.info("成功创建Supabase客户端连接")

                    # 测试连接有效性 - 使用实际存在的表
                    test_result = cls._client.table('tb_ma_template_prompt').select('id').limit(1).execute()
                    if test_result.data is not None:
                        logger.info("Supabase连接测试成功")
                        break
                    else:
                        logger.warning("连接测试失败，返回数据为空，将重试")
                        cls._client = None
                        retry_count += 1
                        time.sleep(retry_delay)
                        retry_delay *= 1.5
                        
                except requests.exceptions.SSLError as ssl_err:
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.warning(f"Supabase SSL连接错误，重试 ({retry_count}/{max_retries}): {ssl_err}")
                        time.sleep(retry_delay)
                        retry_delay *= 1.5  # 渐进增加重试延迟
                        cls._client = None
                    else:
                        logger.error(f"Supabase SSL连接失败，已达最大重试次数: {ssl_err}")
                        raise
                        
                except requests.exceptions.ConnectionError as conn_err:
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.warning(f"Supabase连接错误，重试 ({retry_count}/{max_retries}): {conn_err}")
                        time.sleep(retry_delay)
                        retry_delay *= 1.5
                        cls._client = None
                    else:
                        logger.error(f"Supabase连接失败，已达最大重试次数: {conn_err}")
                        raise
                        
                except APIError as api_err:
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.warning(f"Supabase API错误，重试 ({retry_count}/{max_retries}): {api_err}")
                        time.sleep(retry_delay)
                        retry_delay *= 1.5
                        cls._client = None
                    else:
                        logger.error(f"Supabase API错误，已达最大重试次数: {api_err}")
                        raise
                        
                except Exception as e:
                    # 检查是否是EOF错误
                    if "EOF occurred in violation of protocol" in str(e) or "Connection reset by peer" in str(e):
                        retry_count += 1
                        if retry_count < max_retries:
                            logger.warning(f"Supabase连接意外中断，重试 ({retry_count}/{max_retries}): {e}")
                            time.sleep(retry_delay)
                            retry_delay *= 1.5
                            cls._client = None
                        else:
                            logger.error(f"Supabase连接失败，已达最大重试次数: {e}")
                            raise
                    else:
                        logger.error(f"创建Supabase客户端连接错误: {e}")
                        raise
        
        return cls._client
    
    @classmethod
    def execute_with_retry(cls, operation_func, max_retries=None):
        """执行Supabase操作并自动重试失败的请求
        
        Args:
            operation_func: 要执行的函数，应该接受client参数
            max_retries: 最大重试次数，默认使用配置中的值
            
        Returns:
            操作结果
        """
        if max_retries is None:
            max_retries = Config.SUPABASE_MAX_RETRIES
            
        retry_count = 0
        retry_delay = Config.SUPABASE_RETRY_DELAY  # 初始重试延迟（秒）
        last_error = None
        
        while retry_count <= max_retries:
            try:
                client = cls.get_client()
                return operation_func(client)
                
            except requests.exceptions.SSLError as e:
                last_error = e
                retry_count += 1
                if retry_count <= max_retries:
                    logger.warning(f"SSL错误，正在重试操作 ({retry_count}/{max_retries}): {e}")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5  # 渐进增加重试延迟
                    # 重置连接
                    client = cls.reset_connection()
                    
            except requests.exceptions.ConnectionError as e:
                last_error = e
                retry_count += 1
                if retry_count <= max_retries:
                    logger.warning(f"连接错误，正在重试操作 ({retry_count}/{max_retries}): {e}")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5
                    # 重置连接
                    client = cls.reset_connection()
                    
            except APIError as e:
                last_error = e
                retry_count += 1
                if retry_count <= max_retries:
                    logger.warning(f"API错误，正在重试操作 ({retry_count}/{max_retries}): {e}")
                    time.sleep(retry_delay)
                    retry_delay *= 1.5
                    # 重置连接
                    client = cls.reset_connection()
            
            except (TypeError, ValueError) as e:
                # 对于参数类型或值错误不进行重试，因为这通常是代码问题
                logger.error(f"参数错误: {e}")
                return None
                    
            except Exception as e:
                # 检查是否是可重试的错误类型
                error_str = str(e).lower()
                if ("server disconnected" in error_str or
                    "eof occurred" in error_str or
                    "connection reset by peer" in error_str or
                    "unexpected eof" in error_str or
                    "server closed" in error_str or
                    "connection refused" in error_str or
                    "internal server error" in error_str):
                    last_error = e
                    retry_count += 1
                    if retry_count <= max_retries:
                        logger.warning(f"连接意外中断，正在重试操作 ({retry_count}/{max_retries}): {e}")
                        time.sleep(retry_delay)
                        retry_delay *= 1.5
                        # 重置连接
                        client = cls.reset_connection()
                    else:
                        logger.error(f"操作失败，已达最大重试次数: {e}")
                else:
                    # 其他异常不重试
                    logger.error(f"操作执行错误: {e}")
                    return None
        
        logger.error(f"操作失败，已达最大重试次数: {last_error}")
        return None

    # tweet_info 表操作方法
    
    @classmethod
    def save_tweet_info(cls, tweet_id, tweet_url, tweet_created_at, tweet_replay, user_id=None):
        """保存推文信息到Supabase"""
        # 创建一个包装user_id的可变对象，以便在内部函数中修改
        user_id_container = {'value': user_id}
        
        def operation(client):
            try:
                # 检查是否已存在相同的tweet_id
                result = client.table('tweet_info').select('id').eq('tweet_id', tweet_id).execute()
                
                # 尝试从 tweet_replay 中提取 user_id（如果未提供）
                if user_id_container['value'] is None and tweet_replay:
                    try:
                        replay_data = json.loads(tweet_replay) if isinstance(tweet_replay, str) else tweet_replay
                        if isinstance(replay_data, dict):
                            if 'tweets' in replay_data and replay_data['tweets']:
                                first_tweet = replay_data['tweets'][0]
                                if 'author' in first_tweet and 'id' in first_tweet['author']:
                                    user_id_container['value'] = str(first_tweet['author']['id'])
                                elif 'user' in first_tweet and 'id' in first_tweet['user']:
                                    user_id_container['value'] = str(first_tweet['user']['id'])
                            elif 'user' in replay_data and 'id' in replay_data['user']:
                                user_id_container['value'] = str(replay_data['user']['id'])
                            elif 'author' in replay_data and 'id' in replay_data['author']:
                                user_id_container['value'] = str(replay_data['author']['id'])
                    except Exception as e:
                        logger.warning(f"从 tweet_replay 提取 user_id 失败: {e}")
                
                # 准备更新或插入的数据
                data = {
                    'tweet_url': tweet_url,
                    'tweet_created_at': tweet_created_at,
                    'tweet_replay': tweet_replay
                }
                
                # 如果有user_id，添加到数据中
                if user_id_container['value'] is not None:
                    data['user_id'] = user_id_container['value']
                
                if result.data and len(result.data) > 0:
                    # 更新现有记录
                    tweet_id_int = result.data[0]['id']
                    data['mtime'] = 'now()'
                    client.table('tweet_info').update(data).eq('id', tweet_id_int).execute()
                    logger.info(f"更新推文信息: {tweet_id}" + (f", user_id: {user_id_container['value']}" if user_id_container['value'] else ""))
                else:
                    # 插入新记录
                    data['tweet_id'] = tweet_id
                    client.table('tweet_info').insert(data).execute()
                    logger.info(f"保存新推文: {tweet_id}" + (f", user_id: {user_id_container['value']}" if user_id_container['value'] else ""))
                
                return True
                
            except Exception as e:
                logger.error(f"保存推文信息错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return False
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_tweet_by_id(cls, tweet_id):
        """根据推文ID获取推文信息"""
        def operation(client):
            try:
                # 使用正确的filter用法，提供column, operator, value三个参数
                result = client.table('tweet_info').select('*').eq('tweet_id', tweet_id).execute()
                
                if result.data and len(result.data) > 0:
                    return result.data[0]
                return None
                
            except Exception as e:
                logger.error(f"获取推文信息错误: {e}")
                return None
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_tweet_by_url(cls, tweet_url):
        """根据推文URL获取推文信息"""
        def operation(client):
            try:
                result = client.table('tweet_info').select('*').eq('tweet_url', tweet_url).execute()
                
                if result.data and len(result.data) > 0:
                    return result.data[0]
                return None
                
            except Exception as e:
                logger.error(f"获取推文信息错误: {e}")
                return None
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def delete_tweet(cls, tweet_id):
        """删除推文信息"""
        def operation(client):
            try:
                result = client.table('tweet_info').delete().eq('tweet_id', tweet_id).execute()
                
                if result.data and len(result.data) > 0:
                    logger.info(f"删除推文: {tweet_id}")
                    return True
                logger.warning(f"要删除的推文不存在: {tweet_id}")
                return False
                
            except Exception as e:
                logger.error(f"删除推文错误: {e}")
                return False
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_all_tweets(cls, limit=100, offset=0):
        """获取所有推文信息，带分页"""
        def operation(client):
            try:
                result = client.table('tweet_info').select('*').order('id', desc=True).range(offset, offset + limit - 1).execute()
                
                return result.data
                
            except Exception as e:
                logger.error(f"获取推文列表错误: {e}")
                return []
        
        return cls.execute_with_retry(operation)
    
    # retweet 表的操作方法
    
    @classmethod
    def save_retweet(cls, tid, mid, tweet_id, retweet_info, lang="default"):
        """保存二次创作推文信息到Supabase"""
        # 如果retweet_info是列表或字典，转为JSON字符串
        if isinstance(retweet_info, (list, dict)):
            retweet_info_str = json.dumps(retweet_info, ensure_ascii=False)
        else:
            retweet_info_str = retweet_info
            
        def operation(client):
            try:
                # 检查是否已存在相同的tid
                result = client.table('retweet').select('id').eq('tid', tid).execute()
                
                data = {
                    'tid': tid,
                    'tweet_id': tweet_id,
                    'retweet_info': retweet_info_str,
                    'lang': lang
                }
                
                # 如果mid有值，添加到数据中
                if mid is not None:
                    data['mid'] = mid
                
                if result.data and len(result.data) > 0:
                    # 更新现有记录
                    retweet_id = result.data[0]['id']
                    data['mtime'] = 'now()'
                    client.table('retweet').update(data).eq('id', retweet_id).execute()
                    logger.info(f"更新二次创作推文信息: {tid}")
                else:
                    # 插入新记录
                    client.table('retweet').insert(data).execute()
                    logger.info(f"保存新二次创作推文: {tid}")
                
                return True
                
            except Exception as e:
                logger.error(f"保存二次创作推文信息错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return False
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_retweet_by_tid(cls, tid):
        """根据TID获取二次创作推文信息"""
        def operation(client):
            try:
                result = client.from_('retweet').select('*').filter('tid', 'eq', tid).execute()
                
                if result.data and len(result.data) > 0:
                    # 处理retweet_info字段，尝试JSON解析
                    retweet = result.data[0]
                    
                    if 'retweet_info' in retweet and isinstance(retweet['retweet_info'], str):
                        try:
                            # 先尝试解析json
                            retweet_info = json.loads(retweet['retweet_info'])
                            # 保留原始的字符串格式，而不是替换
                            # retweet['retweet_info'] = retweet_info
                            logger.info(f"成功解析retweet_info的JSON格式: {type(retweet_info)}")
                        except json.JSONDecodeError as e:
                            logger.warning(f"解析retweet_info JSON失败，保持原始格式: {e}")
                    
                    return retweet
                return None
                
            except Exception as e:
                logger.error(f"获取二次创作推文信息错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return None
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_retweets_by_tweet_id(cls, tweet_id, limit=100, offset=0):
        """根据推文ID获取所有二次创作推文信息"""
        def operation(client):
            try:
                result = client.table('retweet').select('*').eq('tweet_id', tweet_id).order('id', desc=True).range(offset, offset + limit - 1).execute()
                
                return result.data
                
            except Exception as e:
                logger.error(f"获取二次创作推文列表错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return []
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_retweets_by_mid(cls, mid, limit=100, offset=0):
        """根据MID获取所有二次创作推文信息"""
        def operation(client):
            try:
                result = client.table('retweet').select('*').eq('mid', mid).order('id', desc=True).range(offset, offset + limit - 1).execute()
                
                return result.data
                
            except Exception as e:
                logger.error(f"获取二次创作推文列表错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return []
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def delete_retweet(cls, tid):
        """删除二次创作推文信息"""
        def operation(client):
            try:
                # 先检查是否存在
                check_result = client.table('retweet').select('id').eq('tid', tid).execute()
                
                if not check_result.data or len(check_result.data) == 0:
                    logger.warning(f"要删除的二次创作推文不存在: {tid}")
                    return False
                
                # 执行删除
                client.table('retweet').delete().eq('tid', tid).execute()
                logger.info(f"删除二次创作推文: {tid}")
                return True
                
            except Exception as e:
                logger.error(f"删除二次创作推文错误: {e}")
                cls.reset_connection()  # 遇到错误时重置连接
                return False
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_all_retweets(cls, limit=100, offset=0):
        """获取所有二次创作推文信息，带分页"""
        def operation(client):
            try:
                result = client.table('retweet').select('*').order('id', desc=True).range(offset, offset + limit - 1).execute()
                
                return result.data
                
            except Exception as e:
                logger.error(f"获取二次创作推文列表错误: {e}")
                return []
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_hot_tweets(cls, limit=50, offset=0):
        """获取热门推文信息（只包含标星用户的推文）"""
        def operation(client):
            try:
                # 直接使用SQL查询，不调用存储过程
                raw_tweets = []
                logger.info("开始执行热门推文查询，检查user_id类型匹配问题")
                
          
                star_users = client.from_('tweeter') \
                                 .select('user_id') \
                                 .eq('is_star', True) \
                                 .execute()
                    
                if star_users.data:
                    star_user_ids = [user['user_id'] for user in star_users.data]
                    # 再查询这些用户的推文
                    query_result = client.from_('tweet_info') \
                                           .select('*') \
                                           .in_('user_id', star_user_ids) \
                                           .order('id', desc=True) \
                                           .limit(limit) \
                                           .offset(offset) \
                                           .execute()
                else:
                    query_result.data = []
                
                if query_result.data:
                    raw_tweets = query_result.data
                    logger.info(f"查询到 {len(raw_tweets)} 条标星用户的热门推文")
                    # 添加详细日志来调试第一条推文
                    if len(raw_tweets) > 0:
                        first_tweet = raw_tweets[0]
                        tweet_id = first_tweet.get('tweet_id', 'unknown')
                        user_id = first_tweet.get('user_id', 'unknown')
                        logger.info(f"第一条热门推文: tweet_id={tweet_id}, user_id={user_id}, 类型={type(user_id).__name__}")
                        
                        # 检查是否存在对应的tweeter记录
                        try:
                            if user_id and user_id != 'unknown':
                                tweeter_result = client.from_('tweeter').select('user_id,is_star').eq('user_id', str(user_id)).execute()
                                if tweeter_result.data and len(tweeter_result.data) > 0:
                                    logger.info(f"找到匹配的tweeter记录: {tweeter_result.data[0]}")
                                else:
                                    logger.warning(f"未找到匹配的tweeter记录，user_id={user_id}")
                                    # 尝试使用双方的文本表示进行比较
                                    check_query = f"""
                                    SELECT * FROM tweeter 
                                    WHERE tweeter.user_id::TEXT = '{user_id}'::TEXT 
                                    OR tweeter.user_id::TEXT = trim(both '"' from '{user_id}'::TEXT)
                                    """
                                    logger.info(f"尝试使用文本比较: {check_query}")
                                    check_result = client.rpc('exec_sql', {'query': check_query}).execute()
                                    if check_result.data and len(check_result.data) > 0:
                                        logger.info(f"使用文本比较找到记录: {check_result.data}")
                                    else:
                                        logger.warning("使用文本比较也未找到记录")
                        except Exception as e:
                            logger.error(f"检查tweeter记录时出错: {e}")
                else:
                    logger.info("未找到标星用户的热门推文")
                
                processed_tweets = []
                if not raw_tweets:
                    return []

                for item in raw_tweets:
                    try:
                        tweet_details = {}
                        # 优先处理来自存储过程且已经包含所需字段的情况
                        if 'author' in item and 'media' in item and 'text' in item and 'id' in item and 'ctime' in item:
                            # 假设存储过程返回的 'id' 就是数字ID, 'ctime' 也是正确格式
                            tweet_data = {
                                'id': item.get('id'), # 确保是数字ID
                                'text': item.get('text'),
                                'author': item.get('author'),
                                'media': item.get('media') if isinstance(item.get('media'), list) else [item.get('media')] if item.get('media') else [],
                                'ctime': item.get('ctime') 
                            }
                            # 如果原始数据中有 tweet_replay 字段，添加到返回结果中
                            if 'tweet_replay' in item:
                                tweet_data['tweet_replay'] = item['tweet_replay']
                            processed_tweets.append(tweet_data)
                            continue

                        # 处理需要从 tweet_replay 解析的情况
                        if item.get('tweet_replay'):
                            replay_data = json.loads(item['tweet_replay'])
                            
                            # 检查 replay_data 结构
                            if isinstance(replay_data, dict) and 'tweets' in replay_data and isinstance(replay_data['tweets'], list) and replay_data['tweets']:
                                source_tweet = replay_data['tweets'][0]
                            elif isinstance(replay_data, dict) and 'id' in replay_data: # 直接就是推文对象
                                source_tweet = replay_data
                            else: # 结构不符合预期，尝试从 item 直接取，或者跳过
                                logger.warning(f"tweet_replay 结构不符合预期，tweet_id: {item.get('tweet_id')}")
                                source_tweet = item # 尝试将 item 作为 source_tweet

                        else: # 没有 tweet_replay
                            logger.warning(f"缺少 tweet_replay 数据, tweet_id: {item.get('tweet_id')}")
                            source_tweet = item # 尝试将 item 作为 source_tweet

                        # 从 source_tweet 或 item 中提取数据
                        tweet_id_original = source_tweet.get('id') # 这是期望的数字ID
                        
                        media_data = source_tweet.get('media', source_tweet.get('extended_entities', {}).get('media', []))
                        if media_data is None:
                            media_data = []
                        elif not isinstance(media_data, list):
                            media_data = [media_data]
                        
                        author_data = source_tweet.get('author')
                        if not author_data and 'user' in source_tweet: # 有些API返回 user 而不是 author
                            user_info = source_tweet['user']
                            author_data = {
                                "name": user_info.get("name"),
                                "profilePicture": user_info.get("profile_image_url_https") or user_info.get("profilePicture"),
                                "userName": user_info.get("screen_name") or user_info.get("userName"),
                                "description": user_info.get("description")
                            }
                        
                        # 确保author_data包含description字段，如果没有则尝试从数据库获取
                        if author_data and not author_data.get('description'):
                            try:
                                # 从tweeter表获取用户描述信息
                                user_id = item.get('user_id') or source_tweet.get('author', {}).get('id')
                                if user_id:
                                    user_result = client.from_('tweeter').select('description').eq('user_id', user_id).limit(1).execute()
                                    if user_result.data and user_result.data[0].get('description'):
                                        author_data['description'] = user_result.data[0]['description']
                            except Exception as desc_err:
                                logger.warning(f"获取用户描述信息失败: {desc_err}")
                        
                        # ctime 来自 tweet_info.tweet_created_at
                        # 目标格式 ctime: "2025-05-13 14:49:00"
                        # tweet_info.tweet_created_at 可能是 "Mon Feb 03 01:07:58 +0000 2025"
                        # 需要进行转换
                        ctime_str = item.get('tweet_created_at', source_tweet.get('created_at', source_tweet.get('ctime')))
                        parsed_ctime = ""
                        if ctime_str:
                            try:
                                # 尝试解析 Twitter API 的日期格式
                                from dateutil import parser
                                dt_object = parser.parse(ctime_str)
                                parsed_ctime = dt_object.strftime('%Y-%m-%d %H:%M:%S')
                            except Exception as date_parse_err:
                                logger.warning(f"无法解析日期 {ctime_str} for tweet_id {item.get('tweet_id')}: {date_parse_err}")
                                parsed_ctime = ctime_str # 保留原始字符串以防万一

                        tweet_data = {
                            'id': tweet_id_original if tweet_id_original is not None else item.get('id'), # 优先用解析出来的数字ID
                            'text': source_tweet.get('text', source_tweet.get('full_text')), # full_text for extended tweets
                            'author': author_data,
                            'media': media_data,
                            'ctime': parsed_ctime
                        }
                        
                        # 保留原始的tweet_replay字段，以便后续处理
                        if 'tweet_replay' in item:
                            tweet_data['tweet_replay'] = item['tweet_replay']
                            
                        processed_tweets.append(tweet_data)
                    except json.JSONDecodeError as json_err:
                        logger.error(f"解析tweet_replay失败 for tweet_id {item.get('tweet_id')}: {json_err}. Replay data: {item.get('tweet_replay')}")
                    except Exception as e_proc:
                        logger.error(f"处理热门推文时出错 for tweet_id {item.get('tweet_id')}: {e_proc}")

                logger.info(f"成功处理 {len(processed_tweets)} 条标星用户的热门推文")
                return processed_tweets
                
            except Exception as e:
                logger.error(f"获取热门推文操作错误: {e}")
                return []
        
        result = cls.execute_with_retry(operation)
        return result if result is not None else []
    
    @classmethod
    def get_recent_hot_tweets_count(cls, days=2):
        """获取最近几天内的热门推文数量"""
        def operation(client):
            try:
                # 先尝试调用存储过程
                result = client.rpc('get_recent_hot_tweets_count', {'p_days': days}).execute()
                
                # 如果存储过程不存在或返回为空，尝试其他方式计算
                if not result.data:
                    # 获取最近几天的retweet记录
                    result = client.table('retweet').select('tweet_id').gte('ctime', f"now() - interval '{days} days'").execute()
                    
                    # 计算唯一tweet_id的数量
                    if result.data:
                        unique_tweet_ids = set(item['tweet_id'] for item in result.data)
                        return len(unique_tweet_ids)
                    return 0
                
                return result.data[0]['count'] if result.data else 0
                
            except Exception as e:
                logger.error(f"获取最近热门推文数量错误: {e}")
                return 0
        
        result = cls.execute_with_retry(operation)
        return result if result is not None else 0
    
    @classmethod
    def get_star_tweeters(cls, limit=10):
        """
        获取热门推特用户
        """
        def operation(client):
            try:
                # 查询标记为星标的推特主
                result = client.table('tweeter').select('*').eq('is_star', True).order('followers', desc=True).limit(limit).execute()

                if result.data:
                    star_tweeters = []
                    for tweeter in result.data:
                        # 处理字段名一致性，确保前端能正确显示
                        if 'profile_picture' in tweeter and 'profile_image_url' not in tweeter:
                            tweeter['profile_image_url'] = tweeter['profile_picture']

                        if 'user_name' in tweeter and 'username' not in tweeter:
                            tweeter['username'] = tweeter['user_name']

                        if 'nick_name' in tweeter and 'name' not in tweeter:
                            tweeter['name'] = tweeter['nick_name']

                        star_tweeters.append(tweeter)

                    return star_tweeters
                return []

            except Exception as e:
                logger.error(f"获取星标推特主信息错误: {e}")
                return []

        return cls.execute_with_retry(operation)
            
    @classmethod
    def get_user_by_username(cls, username):
        """
        根据用户名获取用户信息
        
        Args:
            username: 用户名
            
        Returns:
            包含用户信息的字典，如果找不到则返回None
        """
        try:
            result = cls.get_client().table("tweeter") \
                .select("*") \
                .eq("user_name", username) \
                .limit(1) \
                .execute()
                
            if result.data and len(result.data) > 0:
                user = result.data[0]
                # 格式化用户信息为统一格式
                user_info = {
                    "id": user["user_id"],
                    "username": user["user_name"],
                    "name": user["nick_name"],
                    "profile_image": user["profile_picture"],
                    "description": user["description"],
                    "followers": user["followers"],
                    "following": user["following"]
                }
                return user_info
            return None
            
        except Exception as e:
            logger.error(f"Supabase获取用户信息错误: {str(e)}")
            return None
    
    @classmethod
    def get_user_by_id(cls, user_id):
        """
        根据用户ID获取用户信息
        
        Args:
            user_id: 用户ID
            
        Returns:
            包含用户信息的字典，如果找不到则返回None
        """
        def operation(client):
            try:
                result = client.table("tweeter") \
                    .select("*") \
                    .eq("user_id", user_id) \
                    .limit(1) \
                    .execute()
                    
                if result.data and len(result.data) > 0:
                    user = result.data[0]
                    logger.info(f"获取到用户信息: user_id={user_id}, profile_banner_url={user.get('profile_banner_url')}")
                    return user
                return None
                
            except Exception as e:
                logger.error(f"根据user_id获取用户信息错误: {e}")
                return None
                
        return cls.execute_with_retry(operation)
    
    @classmethod
    def save_xiaohongshu_info(cls, tweet_id, tweet_url, title=None, time=None, desc=None, images_list=None):
        """保存小红书笔记信息到Supabase"""
        def operation(client):
            try:
                # 检查是否已存在相同的tweet_id
                result = client.table('xiaohongshu_info').select('id').eq('tweet_id', tweet_id).execute()
                
                data = {
                    'tweet_id': tweet_id,
                    'tweet_url': tweet_url,
                }
                
                # 添加可选字段
                if title is not None:
                    data['title'] = title
                if time is not None:
                    data['time'] = time
                if desc is not None:
                    # 将desc字段名改为description (PostgreSQL关键字兼容)
                    data['description'] = desc
                if images_list is not None:
                    # 如果images_list是列表，转换为JSON字符串
                    if isinstance(images_list, list):
                        data['images_list'] = json.dumps(images_list, ensure_ascii=False)
                    else:
                        data['images_list'] = images_list
                
                if result.data and len(result.data) > 0:
                    # 更新现有记录
                    note_id = result.data[0]['id']
                    data['mtime'] = 'now()'
                    client.table('xiaohongshu_info').update(data).eq('id', note_id).execute()
                    logger.info(f"更新小红书笔记信息: {tweet_id}")
                else:
                    # 插入新记录
                    client.table('xiaohongshu_info').insert(data).execute()
                    logger.info(f"保存新小红书笔记: {tweet_id}")
                
                return True
                
            except Exception as e:
                logger.error(f"保存小红书笔记信息错误: {e}")
                return False
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_xiaohongshu_by_id(cls, tweet_id):
        """根据笔记ID获取小红书笔记信息"""
        def operation(client):
            try:
                # 修正过滤条件，使用filter方法而不是eq方法
                # 问题在于API请求使用URL参数而不是过滤器构建
                result = client.from_('xiaohongshu_info').select('*').filter('tweet_id', 'eq', tweet_id).execute()
                
                if result.data and len(result.data) > 0:
                    note = result.data[0]
                    # 如果images_list是JSON字符串，转换为列表
                    if 'images_list' in note and note['images_list'] and isinstance(note['images_list'], str):
                        try:
                            note['images_list'] = json.loads(note['images_list'])
                        except json.JSONDecodeError:
                            pass
                    return note
                return None
                
            except Exception as e:
                logger.error(f"获取小红书笔记信息错误: {e}")
                return None
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_xiaohongshu_by_url(cls, tweet_url):
        """根据笔记URL获取小红书笔记信息"""
        def operation(client):
            try:
                result = client.from_('xiaohongshu_info').select('*').filter('tweet_url', 'eq', tweet_url).execute()
                
                if result.data and len(result.data) > 0:
                    note = result.data[0]
                    # 如果images_list是JSON字符串，转换为列表
                    if 'images_list' in note and note['images_list'] and isinstance(note['images_list'], str):
                        try:
                            note['images_list'] = json.loads(note['images_list'])
                        except json.JSONDecodeError:
                            pass
                    return note
                return None
                
            except Exception as e:
                logger.error(f"获取小红书笔记信息错误: {e}")
                return None
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def save_xiaohongshu_user(cls, red_id, nickname, userid, image=None, name=None):
        """保存小红书用户信息到Supabase"""
        def operation(client):
            try:
                # 检查是否已存在相同的red_id
                result = client.table('xiaohongshu_user').select('id').eq('red_id', red_id).execute()
                
                data = {
                    'red_id': red_id,
                    'nickname': nickname,
                    'userid': userid,
                }
                
                # 添加可选字段
                if image is not None:
                    data['image'] = image
                if name is not None:
                    data['name'] = name
                
                if result.data and len(result.data) > 0:
                    # 更新现有记录
                    user_id = result.data[0]['id']
                    data['mtime'] = 'now()'
                    client.table('xiaohongshu_user').update(data).eq('id', user_id).execute()
                    logger.info(f"更新小红书用户信息: {red_id}")
                else:
                    # 插入新记录
                    client.table('xiaohongshu_user').insert(data).execute()
                    logger.info(f"保存新小红书用户: {red_id}")
                
                return True
                
            except Exception as e:
                logger.error(f"保存小红书用户信息错误: {e}")
                return False
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_xiaohongshu_user_by_id(cls, red_id):
        """根据用户ID获取小红书用户信息"""
        def operation(client):
            try:
                result = client.from_('xiaohongshu_user').select('*').filter('red_id', 'eq', red_id).execute()
                
                if result.data and len(result.data) > 0:
                    return result.data[0]
                return None
                
            except Exception as e:
                logger.error(f"获取小红书用户信息错误: {e}")
                return None
            
        return cls.execute_with_retry(operation)
    
    # user_lastest_tweet表操作方法
    
    @classmethod
    def save_user_latest_tweet(cls, user_id, tweet_id, tweet_url, text=None, created_at=None, 
                              author=None, extended_entities=None, card=None, entities=None,
                              quote_count=0, favorite_count=0, reply_count=0, retweet_count=0, entry=None, view_count=0):
        """保存用户最新推文信息到Supabase"""
        def operation(client):
            try:
                # 检查是否已存在相同的user_id和tweet_id组合
                result = client.table('user_lastest_tweet').select('id').eq('user_id', user_id).eq('tweet_id', tweet_id).execute()
                
                data = {
                    'user_id': user_id,
                    'tweet_id': tweet_id,
                    'tweet_url': tweet_url,
                }
                
                if text is not None:
                    data['text'] = text
                if created_at is not None:
                    data['created_at'] = created_at
                
                # 处理JSON字段
                if author is not None:
                    if isinstance(author, dict):
                        data['author'] = json.dumps(author, ensure_ascii=False)
                    else:
                        data['author'] = author
                
                if extended_entities is not None:
                    if isinstance(extended_entities, (dict, list)):
                        data['extended_entities'] = json.dumps(extended_entities, ensure_ascii=False)
                    else:
                        data['extended_entities'] = extended_entities
                
                if card is not None:
                    if isinstance(card, dict):
                        data['card'] = json.dumps(card, ensure_ascii=False)
                    else:
                        data['card'] = card
                        
                if entities is not None:
                    if isinstance(entities, dict):
                        data['entities'] = json.dumps(entities, ensure_ascii=False)
                    else:
                        data['entities'] = entities
                
                # 添加统计数据
                data['quote_count'] = quote_count
                data['favorite_count'] = favorite_count
                data['reply_count'] = reply_count
                data['retweet_count'] = retweet_count
                data['view_count'] = view_count
                
                # 添加原始JSON
                if entry is not None:
                    if isinstance(entry, (dict, list)):
                        data['entry'] = json.dumps(entry, ensure_ascii=False)
                    else:
                        data['entry'] = entry
                
                # 如果记录已存在，更新
                if result.data and len(result.data) > 0:
                    record_id = result.data[0]['id']
                    response = client.table('user_lastest_tweet').update(data).eq('id', record_id).execute()
                    logger.info(f"更新用户最新推文信息: {user_id}/{tweet_id}")
                # 否则插入新记录
                else:
                    response = client.table('user_lastest_tweet').insert(data).execute()
                    logger.info(f"保存新用户最新推文: {user_id}/{tweet_id}")
                
                return True
            except Exception as e:
                logger.error(f"保存用户最新推文信息到Supabase失败: {e}")
                return False
            
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_user_latest_tweets(cls, user_id, limit=10, offset=0):
        """获取用户最新推文信息列表，包含统计字段但不包含entry字段"""
        
        def operation(client):
            try:
                # 明确指定要获取的字段，不包括entry字段
                select_fields = 'id, user_id, tweet_id, tweet_url, text, created_at, author, extended_entities, card, entities, quote_count, favorite_count, reply_count, retweet_count, view_count'
                
                result = client.table('user_lastest_tweet') \
                    .select(select_fields) \
                    .eq('user_id', user_id) \
                    .order('created_at', desc=True) \
                    .limit(limit) \
                    .offset(offset) \
                    .execute()
                
                if result.data:
                    tweets = []
                    for tweet_data in result.data:
                        # 处理JSON字段
                        for field in ['author', 'extended_entities', 'card', 'entities']:
                            if field in tweet_data and tweet_data[field] and isinstance(tweet_data[field], str):
                                try:
                                    tweet_data[field] = json.loads(tweet_data[field])
                                except json.JSONDecodeError:
                                    pass
                        
                        # 确保数值字段是整数类型
                        for field in ['quote_count', 'favorite_count', 'reply_count', 'retweet_count', 'view_count']:
                            if field in tweet_data:
                                try:
                                    tweet_data[field] = int(tweet_data[field])
                                except (TypeError, ValueError):
                                    tweet_data[field] = 0
                            else:
                                # 如果字段不存在，设置默认值为0
                                    tweet_data[field] = 0
                        
                        tweets.append(tweet_data)
                        
                    return tweets
                return []
                
            except Exception as e:
                logger.error(f"获取用户最新推文信息列表错误(Supabase): {e}")
                return []
                
        return cls.execute_with_retry(operation)
        
    @classmethod
    def get_user_latest_tweet_id(cls, user_id):
        """获取用户最新的推文ID
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户最新推文ID，如果没有则返回None
        """
        
        def operation(client):
            try:
                logger.info(f"正在从Supabase获取用户 {user_id} 的最新推文ID")
                
                # 使用正确的查询方法，按照创建时间降序排序，只获取一条记录
                result = client.table('user_lastest_tweet') \
                    .select('tweet_id') \
                    .eq('user_id', user_id) \
                    .order('created_at', desc=True) \
                    .limit(1) \
                    .execute()
                
                if result.data and len(result.data) > 0:
                    tweet_id = result.data[0]['tweet_id']
                    logger.info(f"找到用户 {user_id} 的最新推文ID: {tweet_id}")
                    return tweet_id
                    
                logger.info(f"未找到用户 {user_id} 的推文记录")
                return None
                
            except Exception as e:
                logger.error(f"获取用户最新推文ID错误(Supabase): {e}", exc_info=True)
                return None
                
        try:
            return cls.execute_with_retry(operation)
        except Exception as e:
            logger.error(f"执行获取用户最新推文ID操作失败: {e}", exc_info=True)
            return None
    
    @classmethod
    def get_user_latest_tweet_time(cls, user_id):
        """获取用户最新的推文创建时间
        
        Args:
            user_id: 用户ID
            
        Returns:
            用户最新推文的创建时间字符串，如果没有则返回None
        """
        
        def operation(client):
            try:
                logger.info(f"正在从Supabase获取用户 {user_id} 的最新推文创建时间")
                
                # 使用正确的查询方法，按照创建时间降序排序，只获取一条记录
                result = client.table('user_lastest_tweet') \
                    .select('created_at') \
                    .eq('user_id', user_id) \
                    .order('created_at', desc=True) \
                    .limit(1) \
                    .execute()
                
                if result.data and len(result.data) > 0:
                    created_at = result.data[0]['created_at']
                    logger.info(f"找到用户 {user_id} 的最新推文创建时间: {created_at}")
                    return created_at
                    
                logger.info(f"未找到用户 {user_id} 的推文记录")
                return None
                
            except Exception as e:
                logger.error(f"获取用户最新推文创建时间错误(Supabase): {e}", exc_info=True)
                return None
                
        try:
            return cls.execute_with_retry(operation)
        except Exception as e:
            logger.error(f"执行获取用户最新推文创建时间操作失败: {e}", exc_info=True)
            return None
    
    @classmethod
    def check_connection_health(cls):
        """检查Supabase连接健康状态
        
        Returns:
            bool: 连接是否健康
        """
        def operation(client):
            # 执行简单查询测试连接
            test_result = client.table('tweet_info').select('id').limit(1).execute()
            
            # 检查响应是否有效
            if hasattr(test_result, 'data') and test_result.data is not None:
                return True
            return False
        
        try:
            if cls._client is None:
                return False
            
            result = cls.execute_with_retry(operation, max_retries=1)
            return result is True
        except Exception as e:
            logger.warning(f"连接健康检查失败: {e}")
            # 出现异常自动重置连接
            cls.reset_connection()
            return False
    
    @classmethod 
    def ensure_connection_stability_after_batch(cls):
        """确保批量操作后连接状态稳定
        
        在大量批量写入操作后调用此方法，确保连接状态正常
        """
        try:
            logger.info("执行批量操作后的连接稳定性检查...")
            
            # 多次检查连接健康状态
            for attempt in range(3):
                if cls.check_connection_health():
                    logger.info(f"连接健康检查通过 (尝试 {attempt + 1}/3)")
                    return True
                else:
                    logger.warning(f"连接健康检查失败 (尝试 {attempt + 1}/3)，重置连接...")
                    cls.reset_connection()
                    time.sleep(0.5)  # 短暂等待
            
            logger.error("连接稳定性检查最终失败")
            return False
            
        except Exception as e:
            logger.error(f"连接稳定性检查异常: {e}")
            cls.reset_connection()
            return False 

    @classmethod
    def save_tweet_card(cls, uid, user_id, card_html, card_type='uper', tweet_id=None, user_cookie: Optional[str] = None):
        """保存推文卡片HTML到Supabase

        Args:
            uid: 卡片的唯一标识（UUID）
            user_id: 用户ID（推特主ID）
            card_html: 卡片的HTML内容
            card_type: 卡片类型，'uper'代表用户综合卡片，'tweet'代表单条推文卡片，'story'代表故事卡片
            tweet_id: 推文ID（可选，对于story类型必填）

        Returns:
            bool: 保存是否成功
        """
        def operation(client):
            try:
                # 检查是否已存在相同的uid记录
                result = client.table('tweet_card').select('uid').eq('uid', uid).execute()

                # 准备基本数据（不包含时间戳字段，让数据库自动设置）
                data = {
                    'uid': uid,
                    'user_id': user_id,
                    'card_html': card_html,
                    'card_type': card_type
                }

                if user_cookie:
                    data['user_cookie'] = user_cookie

                # 如果提供了tweet_id，将其存储到id字段
                if tweet_id is not None:
                    data['id'] = str(tweet_id)  # 确保是字符串类型

                if result.data and len(result.data) > 0:
                    # 更新现有记录（mtime会自动更新）
                    update_result = client.table('tweet_card').update(data).eq('uid', uid).execute()
                    logger.info(f"更新推文卡片: uid={uid}, tweet_id={tweet_id}, card_type={card_type}, user_cookie={user_cookie}")
                    return True
                else:
                    # 插入新记录（ctime和mtime会自动设置）
                    insert_result = client.table('tweet_card').insert(data).execute()
                    logger.info(f"插入新推文卡片: uid={uid}, tweet_id={tweet_id}, card_type={card_type}, user_cookie={user_cookie}")
                    return True
            except Exception as e:
                logger.error(f"保存推文卡片到Supabase失败: {str(e)}")
                logger.error(f"数据详情: uid={uid}, user_id={user_id}, tweet_id={tweet_id}, card_type={card_type}, user_cookie={user_cookie}")
                return False

        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_tweet_card_by_uid(cls, uid):
        """根据uid从Supabase获取推文卡片

        Args:
            uid: 卡片的唯一标识

        Returns:
            dict: 包含卡片信息的字典，如果未找到返回None
        """
        def operation(client):
            try:
                # 从tweet_card表中查询指定uid的记录
                result = client.table('tweet_card').select('*').eq('uid', uid).limit(1).execute()

                if result.data and len(result.data) > 0:
                    return result.data[0]
                return None

            except Exception as e:
                logger.error(f"从Supabase获取推文卡片失败: {str(e)}")
                return None

        return cls.execute_with_retry(operation)

    @classmethod
    def get_tweet_card_by_tweet_id(cls, tweet_id, card_type='story'):
        """根据tweet_id从Supabase获取推文卡片

        Args:
            tweet_id: 推文ID
            card_type: 卡片类型（可选，默认'story'）

        Returns:
            dict: 包含卡片信息的字典，如果未找到返回None
        """
        def operation(client):
            try:
                # 从tweet_card表中查询指定tweet_id和card_type的记录
                query = client.table('tweet_card').select('*').eq('id', tweet_id)

                if card_type:
                    query = query.eq('card_type', card_type)

                result = query.order('ctime', desc=True).limit(1).execute()

                if result.data and len(result.data) > 0:
                    return result.data[0]
                return None

            except Exception as e:
                logger.error(f"从Supabase根据tweet_id获取推文卡片失败: {str(e)}")
                return None

        return cls.execute_with_retry(operation)

    @classmethod
    def get_story_card_by_uid_prefix(cls, uid_prefix: str):
        """根据UID前缀查找故事卡片，便于恢复缺失的静态文件"""

        def operation(client):
            try:
                query = (client
                         .table('tweet_card')
                         .select('*')
                         .like('uid', f"{uid_prefix}%")
                         .eq('card_type', 'story')
                         .order('ctime', desc=True)
                         .limit(1))

                result = query.execute()

                if result.data and len(result.data) > 0:
                    return result.data[0]

                return None
            except Exception as e:
                logger.error(f"根据UID前缀获取故事卡片失败: {str(e)}")
                return None

        return cls.execute_with_retry(operation)

    @classmethod
    def get_recent_story_cards(cls, limit: int = 10):
        """获取最新的故事卡片列表"""

        def operation(client):
            try:
                result = (client
                          .table('tweet_card')
                          .select('*')
                          .eq('card_type', 'story')
                          .order('ctime', desc=True)
                          .limit(limit)
                          .execute())

                if result.data:
                    return result.data
                return []
            except Exception as e:
                logger.error(f"获取最新故事卡片失败: {str(e)}")
                return []

        return cls.execute_with_retry(operation)

    @classmethod
    def count_tweet_cards_by_user_id(cls, user_id):
        """统计指定用户的推文卡片数量

        Args:
            user_id: 用户ID

        Returns:
            卡片数量
        """
        def operation(client):
            try:
                # 使用user_id字段进行精确匹配
                result = client.table('tweet_card').select('id').eq('user_id', user_id).execute()
                
                if result.data:
                    return len(result.data)
                return 0
                
            except Exception as e:
                logger.error(f"统计用户推文卡片数量失败: {str(e)}")
                return 0
                
        return cls.execute_with_retry(operation)
    
    @classmethod
    def get_tweet_cards_by_user_id(cls, user_id, limit=20, offset=0):
        """根据用户ID获取该用户的所有推文卡片

        Args:
            user_id: 用户ID
            limit: 返回结果数量限制
            offset: 分页偏移量

        Returns:
            包含卡片信息的列表
        """
        def operation(client):
            try:
                # 使用user_id字段进行精确匹配
                result = client.table('tweet_card').select('*').eq('user_id', user_id).order('ctime', desc=True).range(offset, offset + limit - 1).execute()
                
                return result.data
                
            except Exception as e:
                logger.error(f"获取用户推文卡片列表失败: {str(e)}")
                return []
                
        return cls.execute_with_retry(operation)
    
    @classmethod
    def save_user_latest_tweets_batch(cls, tweets_batch):
        """批量保存用户最新推文信息到Supabase
        
        Args:
            tweets_batch: UserTweet对象列表
            
        Returns:
            bool: 保存是否成功
        """
        def operation(client):
            try:
                # 准备批量插入数据
                insert_data = []
                update_data = []
                
                # 先获取所有tweet_id和user_id的组合，检查哪些已存在
                all_ids = [(tweet.user_id, tweet.tweet_id) for tweet in tweets_batch]
                
                # 构建OR条件查询，每批最多50个组合
                batch_size = 50
                existing_ids = set()
                
                for i in range(0, len(all_ids), batch_size):
                    batch_ids = all_ids[i:i+batch_size]
                    
                    # 针对每个(user_id, tweet_id)对构建精确查询
                    for user_id, tweet_id in batch_ids:
                        response = client.table('user_lastest_tweet') \
                            .select('id,user_id,tweet_id') \
                            .eq('user_id', user_id) \
                            .eq('tweet_id', tweet_id) \
                            .execute()
                        
                        if response.data and len(response.data) > 0:
                            existing_ids.add((user_id, tweet_id))
                
                # 对每条推文进行处理
                for tweet in tweets_batch:
                    # 转换为数据库格式
                    tweet_db = tweet.to_db_format()
                    
                    # 检查是否已存在
                    if (tweet.user_id, tweet.tweet_id) in existing_ids:
                        # 已存在，加入更新列表
                        update_data.append(tweet_db)
                    else:
                        # 不存在，加入插入列表
                        insert_data.append(tweet_db)
                
                # 执行批量插入
                if insert_data:
                    # 根据API限制，每次最多插入1000条记录
                    for i in range(0, len(insert_data), 1000):
                        batch = insert_data[i:i+1000]
                        response = client.table('user_lastest_tweet').insert(batch).execute()
                    logger.info(f"批量插入 {len(insert_data)} 条新推文")
                
                # 执行批量更新（Supabase目前不支持真正的批量更新，需要一条一条更新）
                updated_count = 0
                for data in update_data:
                    response = client.table('user_lastest_tweet')\
                        .update(data)\
                        .eq('user_id', data['user_id'])\
                        .eq('tweet_id', data['tweet_id'])\
                        .execute()
                    updated_count += 1
                
                if update_data:
                    logger.info(f"批量更新 {updated_count} 条已存在推文")
                
                return True
                
            except Exception as e:
                logger.error(f"批量保存推文信息到Supabase失败: {e}")
                return False
        
        return cls.execute_with_retry(operation)
    
    @classmethod
    def save_tweeter(cls, user_id, user_name, nick_name=None, description=None, profile_picture=None, followers=0, following=0, created_at=None, statuses_count=0, cover_picture=None):
        """保存Twitter用户信息到Supabase数据库
        
        Args:
            user_id: 用户ID
            user_name: 用户名
            nick_name: 昵称
            description: 用户描述
            profile_picture: 用户头像URL
            followers: 关注者数量
            following: 关注数量
            created_at: 账号创建时间
            statuses_count: 推文数量
            
        Returns:
            bool: 保存是否成功
        """
        def operation(client):
            try:
                # 准备数据
                user_data = {
                    'user_id': user_id,
                    'user_name': user_name,
                    'nick_name': nick_name,
                    'description': description,
                    'profile_picture': profile_picture,
                    'followers': followers,
                    'following': following,
                    'created_at': created_at,
                    'statuses_count': statuses_count,
                    'mtime': datetime.now().isoformat(),
                    'profile_banner_url': cover_picture
                }
                
                # 使用upsert功能（插入新记录或更新现有记录）
                # 指定user_id作为唯一键
                result = client.table('tweeter').upsert(
                    user_data, 
                    on_conflict='user_id'
                ).execute()
                
                if result.data:
                    logger.info(f"成功保存用户信息: {user_id}")
                    return True
                else:
                    logger.warning(f"保存用户信息失败: {user_id}")
                    return False
                    
            except Exception as e:
                logger.error(f"保存用户信息到Supabase错误: {e}", exc_info=True)
                return False
                
        # 执行操作
        return cls.execute_with_retry(operation)
    
    @classmethod
    def update_crawl_task_status(cls, task_id, status, message=None):
        """更新抓取任务状态
        
        Args:
            task_id: Celery任务ID
            status: 任务状态，如'PENDING', 'STARTED', 'SUCCESS', 'FAILURE'
            message: 任务消息
            
        Returns:
            bool: 更新是否成功
        """
        def operation(client):
            try:
                # 准备更新数据
                update_data = {
                    'status': status,
                    'mtime': datetime.now().isoformat()
                }
                
                # 如果提供了message，添加到更新数据中
                if message:
                    update_data['message'] = message
                
                # 更新任务状态
                response = client.table('x_crawl_task').update(update_data).eq('task_id', task_id).execute()
                
                if not response.data:
                    logger.warning(f"未找到任务ID为 {task_id} 的记录")
                    return False
                    
                logger.info(f"已更新任务 {task_id} 状态为 {status}")
                return True
                
            except Exception as e:
                logger.error(f"更新抓取任务状态失败: {e}")
                return False
        
        return cls.execute_with_retry(operation)

    @classmethod
    def get_user_tweets_by_date_range(cls, user_id, start_date, end_date, limit=50, offset=0):
        """根据日期范围获取用户推文列表
        
        Args:
            user_id: 用户ID
            start_date: 开始日期 (格式: YYYY-MM-DD)
            end_date: 结束日期 (格式: YYYY-MM-DD)
            limit: 返回推文数量限制
            offset: 偏移量
            
        Returns:
            推文列表，如果出错返回None
        """
        
        def operation(client):
            try:
                logger.info(f"查询用户推文: user_id={user_id}, 日期范围: {start_date} 到 {end_date}")
                
                # 明确指定要获取的字段
                select_fields = 'id, user_id, tweet_id, tweet_url, text, created_at, author, extended_entities, card, entities, quote_count, favorite_count, reply_count, retweet_count, view_count'
                
                # 构建日期范围查询
                # 注意：end_date需要包含当天的所有时间，所以加上时间部分
                start_datetime = f"{start_date}T00:00:00"
                end_datetime = f"{end_date}T23:59:59"
                
                result = client.table('user_lastest_tweet') \
                    .select(select_fields) \
                    .eq('user_id', user_id) \
                    .gte('created_at', start_datetime) \
                    .lte('created_at', end_datetime) \
                    .order('created_at', desc=True) \
                    .limit(limit) \
                    .offset(offset) \
                    .execute()
                
                if result.data:
                    tweets = []
                    for tweet_data in result.data:
                        # 处理JSON字段
                        for field in ['author', 'extended_entities', 'card', 'entities']:
                            if field in tweet_data and tweet_data[field] and isinstance(tweet_data[field], str):
                                try:
                                    tweet_data[field] = json.loads(tweet_data[field])
                                except json.JSONDecodeError:
                                    logger.warning(f"无法解析JSON字段 {field}: {tweet_data[field]}")
                                    pass
                        
                        # 确保数值字段是整数类型
                        for field in ['quote_count', 'favorite_count', 'reply_count', 'retweet_count', 'view_count']:
                            if field in tweet_data:
                                try:
                                    tweet_data[field] = int(tweet_data[field])
                                except (TypeError, ValueError):
                                    tweet_data[field] = 0
                            else:
                                # 如果字段不存在，设置默认值为0
                                tweet_data[field] = 0
                        
                        tweets.append(tweet_data)
                    
                    logger.info(f"成功查询到 {len(tweets)} 条推文")
                    return tweets
                
                logger.info("未查询到符合条件的推文")
                return []
                
            except Exception as e:
                logger.error(f"根据日期范围获取用户推文错误(Supabase): {e}", exc_info=True)
                return None
                
        return cls.execute_with_retry(operation)
    
    @classmethod
    def log_media_download(cls, tweet_id, media_url, media_type, filename, file_size):
        """记录媒体下载日志到数据库
        
        Args:
            tweet_id: 推文ID
            media_url: 媒体文件URL
            media_type: 媒体类型 ('photo' 或 'video')
            filename: 下载的文件名
            file_size: 文件大小（字节）
            
        Returns:
            bool: 记录是否成功
        """
        def operation(client):
            try:
                # 准备插入数据
                download_data = {
                    'tweet_id': tweet_id,
                    'media_url': media_url,
                    'media_type': media_type,
                    'filename': filename,
                    'file_size': file_size,
                    'downloaded_at': datetime.now().isoformat()
                }
                
                # 插入下载记录
                result = client.table('media_downloads').insert(download_data).execute()
                
                if result.data:
                    logger.info(f"成功记录媒体下载日志: {filename}")
                    return True
                else:
                    logger.warning(f"记录媒体下载日志失败: {filename}")
                    return False
                    
            except Exception as e:
                logger.error(f"记录媒体下载日志时出错: {e}")
                return False
        
        return cls.execute_with_retry(operation) 
