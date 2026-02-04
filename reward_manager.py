
import json
import os
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any
from constants import bot_logger, APPDATA_DIR
from twitch_api import TwitchAPI

@dataclass
class RewardConfig:
    reward_id: str
    obs_actions: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self):
        return asdict(self)

@dataclass
class RewardData:
    id: str
    title: str
    cost: int
    is_enabled: bool
    background_color: str
    image_url_1x: Optional[str]
    prompt: Optional[str]
    is_user_input_required: bool
    is_global_cooldown_enabled: bool
    global_cooldown_seconds: int
    is_max_per_stream_enabled: bool
    max_per_stream: int
    is_max_per_user_per_stream_enabled: bool
    max_per_user_per_stream: int
    should_redemptions_skip_request_queue: bool
    obs_actions: List[Dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_twitch_data(cls, data: Dict[str, Any], obs_actions: List[Dict[str, Any]] = None):
        image_url = None
        # If there's an explicitly provided 'image_url_1x' use it
        if data.get('image_url_1x'):
            image_url = data.get('image_url_1x')
        # Prefer 'image' (the custom image) over 'default_image' when available
        if not image_url:
            image_block = data.get('image') or data.get('default_image') or data.get('images')
            if isinstance(image_block, dict):
                # Prefer the largest available image first (url_4x preferred), then fall back
                for key in ('url_4x', 'url_2x', 'url_1x', 'url', '4x', '2x', '1x'):
                    image_url = image_block.get(key)
                    if image_url:
                        break
            elif isinstance(image_block, str):
                image_url = image_block
        # Some API variants may include 'thumbnail' or nested structures - search shallowly
        if not image_url:
            for k in ('thumbnail', 'image_url', 'imageUrl'):
                v = data.get(k)
                if isinstance(v, str) and v:
                    image_url = v
                    break
        return cls(
            id=data['id'],
            title=data['title'],
            cost=data['cost'],
            is_enabled=data['is_enabled'],
            background_color=data.get('background_color'),
            image_url_1x=image_url,
            prompt=data.get('prompt'),
            is_user_input_required=data.get('is_user_input_required', False),
            is_global_cooldown_enabled=data.get('global_cooldown_setting', {}).get('is_enabled', False),
            global_cooldown_seconds=data.get('global_cooldown_setting', {}).get('global_cooldown_seconds', 0),
            is_max_per_stream_enabled=data.get('max_per_stream_setting', {}).get('is_enabled', False),
            max_per_stream=data.get('max_per_stream_setting', {}).get('max_per_stream', 0),
            is_max_per_user_per_stream_enabled=data.get('max_per_user_per_stream_setting', {}).get('is_enabled', False),
            max_per_user_per_stream=data.get('max_per_user_per_stream_setting', {}).get('max_per_user_per_stream', 0),
            should_redemptions_skip_request_queue=data.get('should_redemptions_skip_request_queue', False),
            obs_actions=obs_actions or []
        )

class RewardManager:
    def __init__(self, config, twitch_api: TwitchAPI):
        self.config = config
        self.twitch_api = twitch_api
        self.rewards: Dict[str, RewardData] = {}
        self.reward_configs: Dict[str, RewardConfig] = {}
        self.load_local_mappings()
        # Load cached rewards so the UI can show them immediately without waiting for Twitch
        try:
            self._load_cached_rewards()
        except Exception as e:
            bot_logger.debug(f"Failed to load cached rewards: {e}")


    def load_local_mappings(self):
        try:
            mappings_data = self.config.get('channel_point_rewards', {})
            for reward_id, data in mappings_data.items():
                self.reward_configs[reward_id] = RewardConfig(
                    reward_id=reward_id,
                    obs_actions=data.get('obs_actions', [])
                )
        except Exception as e:
            bot_logger.error(f"Error loading local reward mappings: {e}")

    def save_local_mappings(self):
        try:
            data_to_save = {}
            for reward_id, config in self.reward_configs.items():
                data_to_save[reward_id] = config.to_dict()
            self.config.set('channel_point_rewards', data_to_save)
        except Exception as e:
            bot_logger.error(f"Error saving local reward mappings: {e}")

    def refresh_rewards(self):
        twitch_rewards = self.twitch_api.get_custom_rewards()
        self.rewards.clear()
        for reward_data in twitch_rewards:
            reward_id = reward_data['id']
            # Get local actions if they exist
            obs_actions = []
            if reward_id in self.reward_configs:
                obs_actions = self.reward_configs[reward_id].obs_actions
            reward = RewardData.from_twitch_data(reward_data, obs_actions)
            # Log reward lacking a thumbnail to help debugging why some don't show
            if not reward.image_url_1x:
                bot_logger.info(f"Reward {reward_id} ('{reward.title}') has no thumbnail URL in Twitch response")
            else:
                bot_logger.info(f"Reward {reward_id} ('{reward.title}') thumbnail: {reward.image_url_1x}")
            self.rewards[reward_id] = reward
        # Summary log
        has_images = sum(1 for r in self.rewards.values() if r.image_url_1x)
        total = len(self.rewards)
        bot_logger.info(f"Loaded {total} rewards; {has_images} have thumbnails")
        # Cache rewards to config so UI can show them instantly on next launch
        try:
            cached = []
            for r in self.rewards.values():
                cached.append({
                    'id': r.id,
                    'title': r.title,
                    'cost': r.cost,
                    'is_enabled': r.is_enabled,
                    'background_color': r.background_color,
                    'image_url_1x': r.image_url_1x,
                    'prompt': r.prompt
                })
            self.config.set('cached_rewards', cached)
            bot_logger.debug(f"Saved {len(cached)} cached rewards to config")
        except Exception as e:
            bot_logger.error(f"Failed to save cached rewards to config: {e}")
        return list(self.rewards.values())

    def create_reward(self, title: str, cost: int, obs_actions: List[Dict] = None, **kwargs):
        twitch_reward = self.twitch_api.create_custom_reward(title, cost, **kwargs)
        reward_id = twitch_reward['id']
        if obs_actions:
            self.reward_configs[reward_id] = RewardConfig(reward_id, obs_actions)
            self.save_local_mappings()
        # Refresh to get full object state
        self.refresh_rewards()
        return self.rewards.get(reward_id)

    def update_reward(self, reward_id: str, obs_actions: List[Dict] = None, **changes):
        if changes:
            self.twitch_api.update_custom_reward(reward_id, **changes)
        if obs_actions is not None:
            self.reward_configs[reward_id] = RewardConfig(reward_id, obs_actions)
            self.save_local_mappings()
        self.refresh_rewards()
        return self.rewards.get(reward_id)

    def delete_reward(self, reward_id: str):
        self.twitch_api.delete_custom_reward(reward_id)
        if reward_id in self.reward_configs:
            del self.reward_configs[reward_id]
            self.save_local_mappings()
        if reward_id in self.rewards:
            del self.rewards[reward_id]

    def get_reward_by_id(self, reward_id: str) -> Optional[RewardData]:
        return self.rewards.get(reward_id)

    def _load_cached_rewards(self):
        try:
            cached = self.config.get('cached_rewards', []) or []
            for rd in cached:
                try:
                    r = RewardData(
                        id=rd.get('id'),
                        title=rd.get('title', ''),
                        cost=rd.get('cost', 0),
                        is_enabled=rd.get('is_enabled', True),
                        background_color=rd.get('background_color'),
                        image_url_1x=rd.get('image_url_1x'),
                        prompt=rd.get('prompt'),
                        is_user_input_required=False,
                        is_global_cooldown_enabled=False,
                        global_cooldown_seconds=0,
                        is_max_per_stream_enabled=False,
                        max_per_stream=0,
                        is_max_per_user_per_stream_enabled=False,
                        max_per_user_per_stream=0,
                        should_redemptions_skip_request_queue=False,
                        obs_actions=self.reward_configs.get(rd.get('id'), RewardConfig(rd.get('id'))).obs_actions
                    )
                    self.rewards[r.id] = r
                except Exception:
                    continue
            bot_logger.info(f"Loaded {len(self.rewards)} cached rewards from config")
        except Exception as e:
            bot_logger.error(f"Failed to load cached rewards from config: {e}")
    def get_actions_for_reward(self, reward_id: str) -> List[Dict]:
        if reward_id in self.reward_configs:
            return self.reward_configs[reward_id].obs_actions
        return []
