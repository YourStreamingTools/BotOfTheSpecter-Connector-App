import json
import os
from datetime import datetime
from typing import Any, Callable, Dict, Optional
from constants import bot_logger

class VariableManager:
    def __init__(self, config):
        self.config = config
        self.variables = {}
        self.counters = {}
        self.listeners = []
        self.load_variables()
        
    def load_variables(self):
        try:
            vars_data = self.config.get('variables', {})
            self.variables = vars_data.get('values', {})
            self.counters = vars_data.get('counters', {})
            bot_logger.info(f"Loaded {len(self.variables)} variables and {len(self.counters)} counters")
        except Exception as e:
            bot_logger.error(f"Error loading variables: {e}")
            self.variables = {}
            self.counters = {}
    
    def save_variables(self):
        try:
            vars_data = {
                'values': self.variables,
                'counters': self.counters
            }
            self.config.set('variables', vars_data)
            bot_logger.debug("Variables saved to config")
        except Exception as e:
            bot_logger.error(f"Error saving variables: {e}")
    
    def set(self, name: str, value: Any):
        old_value = self.variables.get(name)
        self.variables[name] = value
        bot_logger.debug(f"Variable set: {name} = {value}")
        self.save_variables()
        self.notify_listeners('set', name, value, old_value)
    
    def get(self, name: str, default: Any = None) -> Any:
        return self.variables.get(name, default)
    
    def delete(self, name: str):
        if name in self.variables:
            old_value = self.variables[name]
            del self.variables[name]
            bot_logger.debug(f"Variable deleted: {name}")
            self.save_variables()
            self.notify_listeners('delete', name, None, old_value)
    
    def increment(self, name: str, amount: int = 1):
        current = self.counters.get(name, 0)
        self.counters[name] = current + amount
        bot_logger.debug(f"Counter incremented: {name} = {self.counters[name]}")
        self.save_variables()
        self.notify_listeners('increment', name, self.counters[name], current)
    
    def decrement(self, name: str, amount: int = 1):
        self.increment(name, -amount)
    
    def reset_counter(self, name: str):
        if name in self.counters:
            old_value = self.counters[name]
            self.counters[name] = 0
            bot_logger.debug(f"Counter reset: {name}")
            self.save_variables()
            self.notify_listeners('reset', name, 0, old_value)
    
    def get_counter(self, name: str) -> int:
        return self.counters.get(name, 0)
    
    def add_listener(self, callback: Callable):
        if callback not in self.listeners:
            self.listeners.append(callback)
    
    def remove_listener(self, callback: Callable):
        if callback in self.listeners:
            self.listeners.remove(callback)
    
    def notify_listeners(self, action: str, name: str, new_value: Any, old_value: Any):
        for listener in self.listeners:
            try:
                listener(action, name, new_value, old_value)
            except Exception as e:
                bot_logger.error(f"Error in variable listener: {e}")
    
    def handle_event(self, event_type: str, data: dict):
        if not isinstance(data, dict):
            return
            
        timestamp = datetime.now().isoformat()
        
        if event_type == "TWITCH_FOLLOW":
            username = data.get('username') or data.get('user') or data.get('user_name')
            if username:
                self.set('last_follower', username)
                self.set('last_follower_date', timestamp)
                self.increment('session_followers')
                self.increment('total_followers')
                
        elif event_type == "TWITCH_CHEER":
            username = data.get('username') or data.get('user') or data.get('user_name')
            bits = data.get('bits') or data.get('amount')
            if username:
                self.set('last_cheer_user', username)
            if bits:
                try:
                    bits_int = int(bits)
                    self.set('last_cheer_amount', bits_int)
                    self.increment('session_bits', bits_int)
                    self.increment('total_bits', bits_int)
                except ValueError:
                    pass
                    
        elif event_type == "TWITCH_RAID":
            username = data.get('username') or data.get('user') or data.get('from_broadcaster_user_name')
            viewers = data.get('viewers') or data.get('viewer_count')
            if username:
                self.set('last_raider', username)
            if viewers:
                try:
                    self.set('raid_viewer_count', int(viewers))
                except ValueError:
                    pass
                    
        elif event_type == "TWITCH_SUB":
            username = data.get('username') or data.get('user') or data.get('user_name')
            tier = data.get('tier') or data.get('sub_tier')
            months = data.get('months') or data.get('cumulative_months')
            is_gift = data.get('is_gift', False)
            
            if username:
                self.set('last_subscriber', username)
                self.set('last_sub_date', timestamp)
            if tier:
                self.set('last_sub_tier', tier)
            if months:
                try:
                    self.set('last_sub_months', int(months))
                except ValueError:
                    pass
            self.set('last_sub_is_gift', is_gift)
            self.increment('session_subs')
            self.increment('total_subs')
            
        elif event_type == "TWITCH_CHANNELPOINTS":
            username = data.get('username') or data.get('user') or data.get('user_name')
            reward = data.get('reward') or data.get('reward_title') or data.get('title')
            cost = data.get('cost') or data.get('reward_cost')
            
            if username:
                self.set('last_redemption_user', username)
            if reward:
                self.set('last_redemption_title', reward)
            if cost:
                try:
                    self.set('last_redemption_cost', int(cost))
                except ValueError:
                    pass
            self.increment('session_redemptions')
            
        elif event_type in ["FOURTHWALL", "KOFI", "PATREON"]:
            username = data.get('username') or data.get('supporter_name') or data.get('from_name')
            amount = data.get('amount') or data.get('donation_amount')
            
            if username:
                self.set('last_donor', username)
                self.set('last_donation_platform', event_type)
            if amount:
                try:
                    amount_float = float(amount)
                    self.set('last_donation_amount', amount_float)
                    current_total = float(self.get('session_donations', 0))
                    self.set('session_donations', current_total + amount_float)
                except ValueError:
                    pass
            self.increment('session_donation_count')
            
        elif event_type == "DEATHS":
            game = data.get('game')
            if game:
                self.set('current_game', game)
                counter_name = f'deaths_{game}'
                self.increment(counter_name)
                self.set('last_death_game', game)
                self.set('last_death_date', timestamp)
            self.increment('session_deaths')
            
        elif event_type == "STREAM_ONLINE":
            self.set('stream_status', 'online')
            self.set('stream_start_time', timestamp)
            self.reset_counter('session_followers')
            self.reset_counter('session_subs')
            self.reset_counter('session_bits')
            self.reset_counter('session_redemptions')
            self.reset_counter('session_deaths')
            self.reset_counter('session_donation_count')
            self.set('session_donations', 0)
            
        elif event_type == "STREAM_OFFLINE":
            self.set('stream_status', 'offline')
            self.set('stream_end_time', timestamp)
    
    def parse_template(self, template: str) -> str:
        result = template
        
        for name, value in self.variables.items():
            placeholder = f"{{{name}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))
        
        for name, value in self.counters.items():
            placeholder = f"{{{name}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))
        
        now = datetime.now()
        result = result.replace('{date}', now.strftime('%Y-%m-%d'))
        result = result.replace('{time}', now.strftime('%H:%M:%S'))
        result = result.replace('{datetime}', now.strftime('%Y-%m-%d %H:%M:%S'))
        
        return result
    
    def get_all_variables(self) -> Dict[str, Any]:
        all_vars = {}
        all_vars.update(self.variables)
        all_vars.update({f"{k}": v for k, v in self.counters.items()})
        return all_vars
