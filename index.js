/* BetterSed, a Powercord plugin to edit your messages like a boss
 * Copyright (C) 2021 Vendicated
 *
 * BetterSed is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BetterSed is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BetterSed.  If not, see <https://www.gnu.org/licenses/>.
 */

const { Plugin } = require("powercord/entities");
const { getModule, messages, channels } = require("powercord/webpack");

const messageStore = getModule(["getLastEditableMessage"], false);
const userStore = getModule(["getCurrentUser"], false);

module.exports = class BetterSed extends Plugin {
  async startPlugin() {
    messages.sendMessage = (original => async (id, msg, ...params) => {
      let isSed = false;
      // Try to prevent hard crashes in case of bugs by wrapping in try catch
      try {
        // message must start with s followed by non alphanumeric char
        if (!msg.content.startsWith("s") || /[A-za-z0-9]/.test(msg.content.charAt(1))) return await original(id, msg, ...params)?.catch(() => void 0);

        // Escape regex reserved chars
        const s = msg.content.charAt(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Sed pattern matcher: s/matcher -> anythingbutnonescapedsep/replacer -> anythingbutnonescapedsed/flags - idk if i should be proud of myself or disgusted for this regex
        const re = new RegExp(`s${s}(([^${s}\\\\]|\\\\${s}|\\\\[^${s}])+)${s}(([^${s}\\\\]|\\\\${s}|\\\\[^${s}])*)${s}([gi])`, "g");
        const seds = [];
        let match;
        while ((match = re.exec(msg.content))) {
          const [, matcher, , replacer, , flags] = match;
          seds.push([matcher, replacer, flags]);
        }
        if (seds.length) {
          isSed = true;
          // If user is replying to message, edit that, otherwise their last message
          const ref = params[1].messageReference;
          const toEdit = ref ? messageStore.getMessage(ref.channel_id, ref.message_id) : messageStore.getLastEditableMessage(channels.getChannelId());
          // Don't try to edit someone elses messages dummy
          if (!toEdit || toEdit.author.id !== userStore.getCurrentUser().id) return;
          let newContent = toEdit.content;
          for (const [matcher, replacer, flags] of seds) {
            newContent = newContent.replace(new RegExp(matcher, flags), replacer);
          }
          messages.editMessage(toEdit.channel_id, toEdit.id, { content: newContent });
        } else {
          return await original(id, msg, ...params)?.catch(() => void 0);
        }
      } catch {
        if (!isSed) return await original(id, msg, ...params)?.catch(() => void 0);
      }
    })((this.original = messages.sendMessage));
  }

  pluginWillUnload() {
    messages.sendMessage = this.original;
  }
};
