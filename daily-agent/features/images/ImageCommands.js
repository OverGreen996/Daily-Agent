import path from "node:path";
import { randomUUID } from "node:crypto";
import { ModelRole } from "../../models/ModelLifecycleManager.js";
import {
  parseImageGenerationRequest,
  parseImageModeCommand,
  isImageGenerationFollowup,
  parseAttachedImageEdit,
  imageDimensions,
  fitImageDimensions,
  enforceRequestedImageConcepts,
  assertImagePolicy,
  normalizeGenerationSpec,
  mergeContinuationSpec,
} from "../../models/ImageGeneration.js";
const uniquePonyPrompt = (prompt) =>
  [
    ...new Map(
      [
        "score_9",
        "score_8_up",
        "score_7_up",
        "source_photo",
        "realistic photography",
        ...String(prompt || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ].map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  ].join(", ");
const uniquePhotoPrompt = (prompt, checkpoint = "") => {
  if (/pony|wai.?real|stableyogi/i.test(String(checkpoint)))
    return uniquePonyPrompt(prompt);
  return [
    ...new Map(
      [
        "photorealistic",
        "professional photography",
        "natural skin texture",
        "detailed face",
        ...String(prompt || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ].map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  ].join(", ");
};

class ImageCommands {
  imageSessionFor(request = {}) {
    if (!request.deviceId) return this;
    this.mobileImageSessions ??= new Map();
    if (!this.mobileImageSessions.has(request.deviceId))
      this.mobileImageSessions.set(request.deviceId, {
        imageMode: false,
        imageProfile: this.config?.imageDefaultProfile || "fast",
        lastImageSpec: null,
      });
    return this.mobileImageSessions.get(request.deviceId);
  }
  async generateImage(
    originalText,
    requestText,
    request = {},
    previousSpec = null,
    sourceImage = null,
    editDenoise = 0.44,
  ) {
    const imageSession = this.imageSessionFor(request);
    const imageProfile = imageSession.imageProfile;
    const streamId = randomUUID();
    const progress = (type, data = {}) =>
      this.bus.publish(
        type,
        {
          stream_id: streamId,
          request_id: request.id,
          target_device: request.deviceId,
          ...data,
        },
        { transient: true },
      );
    assertImagePolicy(requestText);
    await this.wake();
    progress("pet_state", {
      emotion: "focused",
      activity: "thinking",
      text: "正在整理生圖需求…",
    });
    let parsed = {};
    try {
      const plannerUser = {
        role: "user",
        content: sourceImage
          ? JSON.stringify({
              source_image: true,
              ...(previousSpec ? { base_spec: previousSpec } : {}),
              requested_change: requestText,
            }).slice(0, 6000)
          : previousSpec
            ? JSON.stringify({
                base_spec: previousSpec,
                requested_change: requestText,
              }).slice(0, 6000)
            : requestText.slice(0, 3500),
      };
      if (sourceImage) plannerUser.images = [sourceImage];
      const photo = imageProfile === "photo";
      const plannerInstruction = photo
        ? '把使用者的圖片需求整理成適合寫實 SDXL 的 JSON。若有 source_image，先看懂附件；prompt 要完整保留使用者指定的人物、姿勢、身體部位、構圖與攝影風格，再只套用 requested_change。若輸入包含 base_spec，完整保留原人物與成人尺度，只改 requested_change。prompt 使用清楚、逗號分隔的英文短標籤；具體寫出成年年齡、全身或近景、視角、姿勢、鏡頭、光線、皮膚與場景，不得把使用者要求的部位省略。除非使用者要求，不要加入插畫、動漫、3D、CGI。沒有明確要求裸露或色情時，不得自行加入 nude、naked、nsfw 或 explicit。negative_prompt 只放使用者不要的內容與畫質缺陷，不要加入正向要求。width/height 選 768～1216 且為 64 倍數。steps 26～30，cfg 4～6。只輸出 JSON：{"prompt":"","negative_prompt":"","width":1024,"height":1024,"steps":28,"cfg":6}'
        : '把使用者的圖片需求整理成 JSON。若有 source_image，先看懂附件；prompt 要描述原圖中需要保留的角色、外觀、服裝、姿勢、構圖與風格，再只套用 requested_change。若輸入包含 base_spec，這是修改上一張：完整保留原角色、性別、外觀、成人尺度與風格，只改 requested_change 明確要求的部分。prompt 使用適合 NoobAI XL 1.1 的英文 Danbooru 標籤為主，開頭加入 masterpiece, best quality, newest, absurdres, highres；不要把「亞洲蹲」誤解成人物性別。沒有明確要求裸露或色情時，不得加入 nude、naked、nsfw、explicit、mature content 或脫衣內容。negative_prompt 只放畫質缺陷，不要固定加入 nsfw。width/height 依桌布、直圖、橫圖或方圖選 768～1216 且為 64 倍數。steps 25～30，cfg 5～6。只輸出 JSON：{"prompt":"","negative_prompt":"","width":1024,"height":1024,"steps":28,"cfg":5.5}';
      const answer = await this.full.chat(
        [{ role: "system", content: plannerInstruction }, plannerUser],
        { format: "json", num_predict: 900, temperature: 0.3 },
      );
      parsed = JSON.parse(answer.message.content);
    } catch {
      parsed = { prompt: requestText };
    }
    const sourceSize = sourceImage
      ? fitImageDimensions(imageDimensions(Buffer.from(sourceImage, "base64")))
      : null;
    const plannedSpec = sourceImage
      ? enforceRequestedImageConcepts({ ...parsed, ...sourceSize }, requestText)
      : previousSpec
        ? mergeContinuationSpec(previousSpec, parsed, requestText)
        : enforceRequestedImageConcepts(parsed, requestText);
    const spec =
      imageProfile === "photo"
        ? normalizeGenerationSpec({
            ...plannedSpec,
            prompt: uniquePhotoPrompt(
              plannedSpec.prompt,
              this.config.imagePhotoCheckpoint,
            ),
            steps: Math.max(28, plannedSpec.steps),
            cfg: Math.max(5, Math.min(7, plannedSpec.cfg)),
          })
        : plannedSpec;
    assertImagePolicy(`${requestText}\n${spec.prompt}`);
    // Image prompts and edit inputs live only in this session, never in Palace or disk snapshots.
    await this.lifecycle.save_runtime_state();
    let result;
    try {
      await this.lifecycle.unload_model(ModelRole.FULL_LLM);
      await this.lifecycle.unload_model(ModelRole.IDLE_LLM);
      this.imageRuntime.setProfile?.(imageProfile);
      progress("generation_progress", {
        stage: "loading",
        text: "正在載入本地生圖模型…",
      });
      await this.lifecycle.load_model(ModelRole.IMAGE_GENERATOR);
      progress("generation_progress", {
        stage: "sampling",
        text: "正在本機生成圖片…",
      });
      result = await this.imageRuntime.generate(spec, {
        sourceImage,
        denoise: editDenoise,
        onProgress: (data) => progress("generation_progress", data),
      });
    } finally {
      if (
        this.lifecycle.get_active_model().gpu_owner ===
        ModelRole.IMAGE_GENERATOR
      )
        await this.lifecycle.unload_model(ModelRole.IMAGE_GENERATOR);
      progress("generation_progress", {
        stage: "restoring",
        text: "圖片完成，正在恢復對話模型…",
      });
      await this.lifecycle.load_model(ModelRole.FULL_LLM);
      await this.lifecycle.restore_runtime_state();
    }
    const content = `${sourceImage ? "改好了" : "畫好了"}。${result.spec.width} × ${result.spec.height}，seed ${result.spec.seed}。`;
    imageSession.lastImageSpec = result.spec;
    this.states.touch();
    this.bus.publish(
      "generated_image",
      {
        target_device: request.deviceId,
        stream_id: streamId,
        file: result.file,
        name: path.basename(result.file),
        width: result.spec.width,
        height: result.spec.height,
      },
      { transient: true },
    );
    this.bus.publish(
      "message",
      {
        target_device: request.deviceId,
        stream_id: streamId,
        role: "assistant",
        content,
      },
      { transient: true },
    );
    return {
      stream_id: streamId,
      content,
      image: result.bytes.toString("base64"),
      image_name: path.basename(result.file),
      generation: result.spec,
    };
  }
}
export const imageSessionFor = ImageCommands.prototype.imageSessionFor;
export const generateImage = ImageCommands.prototype.generateImage;
export async function imageChat(agent, text, image, document, request = {}) {
  return async function () {
    const originalText = text;
    const imageSession = this.imageSessionFor(request);
    const imageModeCommand =
      !image && !document ? parseImageModeCommand(text) : null;
    if (imageModeCommand) {
      return this.exclusive(async () => {
        const previousProfile = imageSession.imageProfile;
        imageSession.imageMode = imageModeCommand !== "exit";
        if (imageModeCommand === "new" || imageModeCommand === "exit")
          imageSession.lastImageSpec = null;
        if (imageModeCommand === "enter_quality")
          imageSession.imageProfile = "quality";
        if (imageModeCommand === "enter_fast")
          imageSession.imageProfile = "fast";
        if (imageModeCommand === "enter_photo")
          imageSession.imageProfile = "photo";
        if (previousProfile !== imageSession.imageProfile)
          imageSession.lastImageSpec = null;
        this.states.touch();
        this.companion.boredom.respond();
        const streamId = randomUUID();
        const content =
          imageModeCommand === "new"
            ? "上一張已結束。直接描述新圖片，我會從零生成；說「結束生圖」才會回到一般聊天。"
            : imageSession.imageMode
              ? `已進入${imageSession.imageProfile === "photo" ? "真人" : imageSession.imageProfile === "quality" ? "動漫" : "快速動漫"}模式。直接描述會生成新圖片；只有明確說「修改上一張」才會延續。說「結束生圖」回到一般聊天。`
              : "已結束生圖模式，回到一般聊天。";
        this.bus.publish(
          "message",
          {
            target_device: request.deviceId,
            stream_id: streamId,
            role: "assistant",
            content,
          },
          { transient: true },
        );
        return {
          stream_id: streamId,
          content,
          image_mode: imageSession.imageMode,
        };
      });
    }
    let imageCommand =
      !image && !document ? parseImageGenerationRequest(text) : null;
    const imageFollowupIntent =
      !image && !document && isImageGenerationFollowup(text);
    if (
      !imageCommand &&
      !image &&
      !document &&
      (imageSession.imageMode ||
        (imageSession.lastImageSpec && imageFollowupIntent))
    ) {
      const followup = imageFollowupIntent;
      if (followup && imageSession.lastImageSpec)
        imageCommand = {
          request: text,
          previousSpec: imageSession.lastImageSpec,
        };
      // A first description can legitimately contain pose, clothing or adult
      // terms that also occur in edit commands.  In an explicit image mode,
      // there is nothing to continue until a render has actually succeeded,
      // so treat it as a fresh generation instead of rejecting it.
      else if (imageSession.imageMode) imageCommand = { request: text };
    }
    if (imageCommand) {
      this.states.touch();
      this.companion.boredom.respond();
      if (this.states.state === "IDLE") {
        await this.companion.cancel();
        await this.browser.close();
      }
      return this.exclusive(() =>
        this.generateImage(
          originalText,
          imageCommand.request,
          request,
          imageCommand.previousSpec,
        ),
      );
    }
    const attachedEdit =
      image && !document ? parseAttachedImageEdit(text) : null;
    if (attachedEdit) {
      this.states.touch();
      this.companion.boredom.respond();
      if (this.states.state === "IDLE") {
        await this.companion.cancel();
        await this.browser.close();
      }
      const previousSpec = imageSession.lastImageSpec;
      return this.exclusive(() =>
        this.generateImage(
          originalText,
          attachedEdit.request,
          request,
          previousSpec,
          image,
          attachedEdit.denoise,
        ),
      );
    }

    return null;
  }.call(agent);
}
