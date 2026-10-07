// Existing feature tests isolate their answering mocks from the required planner.
export function withUnderstanding(answer, { needsSearch = false } = {}) {
  return async function(messages, options = {}) {
    if (options.format?.properties?.needs_search) {
      const { current_question } = JSON.parse(messages.at(-1).content);
      return { message: { content: JSON.stringify({ goal: '處理原問題', topic: '測試',
        needs_search: needsSearch, query: needsSearch ? current_question : '' }) } };
    }
    return answer.apply(this, [messages, options]);
  };
}
