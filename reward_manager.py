
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
        default_image = data.get('default_image')
        image_url = None
        if default_image:
            image_url = default_image.get('url_1x')
        return cls(
            id=data['id'],
            title=data['title'],
            cost=data['cost'],
            is_enabled=data['is_enabled'],
            background_color=data['background_color'],
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
            self.rewards[reward_id] = RewardData.from_twitch_data(reward_data, obs_actions)
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

    def get_actions_for_reward(self, reward_id: str) -> List[Dict]:
        if reward_id in self.reward_configs:
            return self.reward_configs[reward_id].obs_actions
        return []
