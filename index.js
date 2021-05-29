/* BetterSed, a Powercord plugin to edit your messages like a boss
 * Copyright (C) 2021 Vendicated
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
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
        const re = new RegExp(`s${s}(([^${s}\\\\]|\\\\${s}|\\\\[^${s}])+)${s}(([^${s}\\\\]|\\\\${s}|\\\\[^${s}])*)${s}([gi]*)`, "g");
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
