"""대화에서 핵심 결정/사실을 추출한다."""
from __future__ import annotations

from typing import Any

from src.core.logging.logger import get_logger

log = get_logger("MemoryExtractor")

_EXTRACT_PROMPT = """\
다음은 Director와 사용자 간의 대화 기록입니다.
이 대화에서 향후 세션에 기억해야 할 핵심 정보를 추출하세요.

<conversation>
{conversation}
</conversation>

JSON 형식으로 답변하세요:
{{
  "summary": "대화 내용 1-2문장 요약",
  "decisions": ["결정된 사항 1", "결정된 사항 2", ...],
  "tech_stack": ["사용하기로 한 기술 스택 (있으면)"],
  "user_preferences": ["사용자 선호/요구사항 (있으면)"]
}}

결정된 사항이 없으면 빈 배열로 반환하세요.
"""


async def extract_memories(
    conversation: list[dict[str, str]],
    llm_client: Any,
) -> dict[str, Any]:
    """대화 기록에서 기억할 정보를 추출한다."""
    if not conversation:
        return {"summary": "", "decisions": [], "tech_stack": [], "user_preferences": []}

    # 대화를 텍스트로 변환
    lines = []
    for turn in conversation:
        role = "User" if turn["role"] == "user" else "Director"
        lines.append(f"{role}: {turn['content']}")
    conv_text = "\n".join(lines)

    prompt = _EXTRACT_PROMPT.format(conversation=conv_text)

    try:
        data, _, _ = await llm_client.chat_json(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.1,
        )
        if not isinstance(data, dict):
            return {"summary": "", "decisions": [], "tech_stack": [], "user_preferences": []}
        return data
    except Exception as e:
        log.warning("Memory extraction failed", err=str(e))
        return {"summary": "", "decisions": [], "tech_stack": [], "user_preferences": []}
