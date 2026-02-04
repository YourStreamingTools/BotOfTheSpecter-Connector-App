
import requests
import time
from datetime import datetime, timedelta
from constants import (
    BOTOFTHESPECTER_API_BASE, 
    TWITCH_API_BASE, 
    TWITCH_CLIENT_ID,
    TOKEN_EXPIRATION_HOURS,
    bot_logger,
    websocket_logger
)

class TwitchAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self._cached_token = None
        self._cached_token_timestamp = None
        self.broadcaster_id = None
        self.display_name = None
        self.broadcaster_login = None
        
        # Initial token fetch attempt
        try:
            if self.api_key:
                self._get_valid_token()
        except Exception as e:
            bot_logger.warning(f"Initial Twitch token fetch failed: {e}")

    def set_api_key(self, api_key):
        self.api_key = api_key
        self._cached_token = None
        self._cached_token_timestamp = None
        # Try to refresh immediately
        try:
            self._get_valid_token()
        except Exception as e:
            bot_logger.error(f"Failed to refresh token with new key: {e}")


    def _get_valid_token(self):
        """Get valid useable_access_token, fetching new one via BotOfTheSpecter API if expired"""
        now = datetime.now()
        
        # Check if we have a valid cached token
        if self._cached_token and self._cached_token_timestamp:
            # Check if token is within the valid window (less than 4 hours old)
            token_age = now - self._cached_token_timestamp
            if token_age < timedelta(hours=TOKEN_EXPIRATION_HOURS):
                return self._cached_token

        # Fetch new token from BotOfTheSpecter
        try:
            bot_logger.info("Fetching new Twitch credentials from BotOfTheSpecter API...")
            response = requests.get(
                f"{BOTOFTHESPECTER_API_BASE}/account",
                params={'api_key': self.api_key},
                timeout=10
            ) 
            response.raise_for_status()
            data = response.json()
            
            # Critical: Use useable_access_token as this is the delegated token
            self._cached_token = data.get('useable_access_token')
            updated_str = data.get('useable_access_token_updated')
            
            # Parse timestamp or fallback to now
            try:
                if updated_str:
                    self._cached_token_timestamp = datetime.strptime(updated_str, '%Y-%m-%d %H:%M:%S')
                else:
                    self._cached_token_timestamp = now
                    bot_logger.warning("No token timestamp in response, assuming fresh")
            except ValueError:
                self._cached_token_timestamp = now
                bot_logger.warning(f"Could not parse token timestamp {updated_str}, assuming fresh")

            self.broadcaster_id = str(data.get('twitch_user_id'))
            self.display_name = data.get('twitch_display_name')
            self.broadcaster_login = data.get('twitch_display_name', '').lower() # approximated
            
            if not self._cached_token:
                raise ValueError("No useable_access_token found in response")
                
            bot_logger.info(f"Successfully refreshed Twitch credentials for {self.display_name}")
            return self._cached_token
            
        except Exception as e:
            bot_logger.error(f"Failed to fetch Twitch credentials: {e}")
            raise

    def _get_headers(self):
        token = self._get_valid_token()
        return {
            'Authorization': f'Bearer {token}',
            'Client-Id': TWITCH_CLIENT_ID,
            'Content-Type': 'application/json'
        }

    def get_custom_rewards(self):
        """Fetch all custom rewards for the channel"""
        bot_logger.info("TwitchAPI: fetching custom rewards for broadcaster_id=%s", self.broadcaster_id)
        try:
            response = requests.get(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards",
                headers=self._get_headers(),
                params={
                    'broadcaster_id': self.broadcaster_id,
                    # Only request rewards that are manageable by this client/application
                    'only_manageable_rewards': 'true'
                },
                timeout=10
            )
            response.raise_for_status()
            data = response.json().get('data', [])
            bot_logger.info("TwitchAPI: fetched %d rewards from Twitch", len(data))
            return data
        except Exception as e:
            bot_logger.error(f"TwitchAPI: error fetching custom rewards: {e}")
            raise

    def create_custom_reward(self, title, cost, **kwargs):
        """Create a new custom reward"""
        data = {
            'title': title,
            'cost': cost,
            **kwargs
        }
        try:
            response = requests.post(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards",
                headers=self._get_headers(),
                params={'broadcaster_id': self.broadcaster_id},
                json=data,
                timeout=10
            )
            response.raise_for_status()
            return response.json().get('data', [{}])[0]
        except Exception as e:
            bot_logger.error(f"Error creating custom reward: {e}")
            raise

    def update_custom_reward(self, reward_id, **kwargs):
        """Update an existing custom reward"""
        try:
            response = requests.patch(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards",
                headers=self._get_headers(),
                params={
                    'broadcaster_id': self.broadcaster_id,
                    'id': reward_id
                },
                json=kwargs,
                timeout=10
            )
            response.raise_for_status()
            return response.json().get('data', [{}])[0]
        except Exception as e:
            bot_logger.error(f"Error updating custom reward {reward_id}: {e}")
            raise

    def delete_custom_reward(self, reward_id):
        """Delete a custom reward"""
        try:
            response = requests.delete(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards",
                headers=self._get_headers(),
                params={
                    'broadcaster_id': self.broadcaster_id,
                    'id': reward_id
                },
                timeout=10
            )
            response.raise_for_status()
            return True
        except Exception as e:
            bot_logger.error(f"Error deleting custom reward {reward_id}: {e}")
            raise

    def get_reward_redemptions(self, reward_id, status=None, ids=None):
        """Get redemptions for a reward"""
        params = {
            'broadcaster_id': self.broadcaster_id,
            'reward_id': reward_id
        }
        if ids:
            params['id'] = ids
        elif status:
            params['status'] = status
        else:
            params['status'] = 'UNFULFILLED' # Default

        try:
            response = requests.get(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards/redemptions",
                headers=self._get_headers(),
                params=params,
                timeout=10
            )
            response.raise_for_status()
            return response.json().get('data', [])
        except Exception as e:
            bot_logger.error(f"Error fetching redemptions: {e}")
            return []

    def update_redemption_status(self, reward_id, redemption_id, status):
        """Update redemption status (FULFILLED or CANCELED)"""
        try:
            response = requests.patch(
                f"{TWITCH_API_BASE}/channel_points/custom_rewards/redemptions",
                headers=self._get_headers(),
                params={
                    'broadcaster_id': self.broadcaster_id,
                    'reward_id': reward_id,
                    'id': redemption_id
                },
                json={'status': status},
                timeout=10
            )
            response.raise_for_status()
            return response.json().get('data', [{}])[0]
        except Exception as e:
            bot_logger.error(f"Error updating redemption status: {e}")
            raise
