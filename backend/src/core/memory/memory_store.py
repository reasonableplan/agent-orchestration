"""Director 장기 기억 저장소 — Qdrant 기반."""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from src.core.logging.logger import get_logger
from src.core.resilience.api_retry import with_retry

log = get_logger("MemoryStore")

COLLECTION_NAME = "agent_memory"
LESSONS_COLLECTION = "agent_lessons"
EMBEDDING_DIM = 384  # fastembed BAAI/bge-small-en-v1.5
MAX_MEMORY_COUNT = 10_000
MAX_CONTENT_LENGTH = 2000


@dataclass
class Memory:
    """하나의 기억 단위."""
    id: str
    content: str
    category: str  # "decision", "preference", "context", "fact"
    source: str  # "director", "user"
    created_at: str
    metadata: dict[str, Any] = field(default_factory=dict)
    score: float = 0.0


class MemoryStore:
    """에이전트 장기 기억 저장/검색."""

    def __init__(self, qdrant: QdrantClient, embedding_fn: Any) -> None:
        self._qdrant = qdrant
        self._embed = embedding_fn
        self._collection_ready = False
        self._ensure_lock = asyncio.Lock()

    async def ensure_collection(self) -> None:
        """컬렉션이 없으면 생성한다."""
        if self._collection_ready:
            return
        async with self._ensure_lock:
            if self._collection_ready:
                return
            result = await with_retry(
                lambda: asyncio.to_thread(self._qdrant.get_collections),
                max_retries=3, label="Qdrant get_collections(memory)",
            )
            if not any(c.name == COLLECTION_NAME for c in result.collections):
                await with_retry(
                    lambda: asyncio.to_thread(
                        self._qdrant.create_collection,
                        collection_name=COLLECTION_NAME,
                        vectors_config=VectorParams(
                            size=EMBEDDING_DIM,
                            distance=Distance.COSINE,
                        ),
                    ),
                    max_retries=3, label="Qdrant create_collection(memory)",
                )
                log.info("Memory collection created")
            self._collection_ready = True

    async def save(
        self,
        content: str,
        category: str = "decision",
        source: str = "director",
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """기억을 저장한다. 반환: memory_id."""
        await self.ensure_collection()

        # 콘텐츠 크기 제한
        content = content[:MAX_CONTENT_LENGTH]

        memory_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        embeddings = list(self._embed([content]))
        if not embeddings:
            log.warning("Failed to embed memory content")
            return memory_id

        vector = embeddings[0]
        if hasattr(vector, "tolist"):
            vector = vector.tolist()

        await with_retry(
            lambda: asyncio.to_thread(
                self._qdrant.upsert,
                collection_name=COLLECTION_NAME,
                points=[PointStruct(
                    id=memory_id,
                    vector=vector,
                    payload={
                        "content": content,
                        "category": category,
                        "source": source,
                        "created_at": now,
                        **(metadata or {}),
                    },
                )],
            ),
            max_retries=3, label="Qdrant upsert(memory)",
        )
        log.debug("Memory saved", memory_id=memory_id, category=category)
        return memory_id

    async def search(
        self,
        query: str,
        top_k: int = 5,
        category: str | None = None,
        min_score: float = 0.3,
    ) -> list[Memory]:
        """관련 기억을 검색한다."""
        await self.ensure_collection()

        embeddings = list(self._embed([query]))
        if not embeddings:
            return []

        query_vector = embeddings[0]
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        conditions = []
        if category:
            conditions.append(
                FieldCondition(key="category", match=MatchValue(value=category))
            )
        search_filter = Filter(must=conditions) if conditions else None

        try:
            result = await with_retry(
                lambda: asyncio.to_thread(
                    self._qdrant.query_points,
                    collection_name=COLLECTION_NAME,
                    query=query_vector,
                    limit=top_k,
                    query_filter=search_filter,
                ),
                max_retries=3, label="Qdrant query_points(memory)",
            )
            hits = result.points
        except Exception as e:
            log.error("Memory search failed", err=str(e))
            return []

        memories = []
        for hit in hits:
            score = hit.score if hit.score is not None else 0.0
            if score < min_score:
                continue
            payload = hit.payload or {}
            memories.append(Memory(
                id=hit.id if isinstance(hit.id, str) else str(hit.id),
                content=payload.get("content", ""),
                category=payload.get("category", ""),
                source=payload.get("source", ""),
                created_at=payload.get("created_at", ""),
                metadata={k: v for k, v in payload.items()
                          if k not in ("content", "category", "source", "created_at")},
                score=score,
            ))

        return memories

    async def search_formatted(self, query: str, top_k: int = 5) -> str:
        """검색 결과를 프롬프트에 안전하게 삽입할 수 있는 XML 형식으로 반환한다."""
        memories = await self.search(query, top_k=top_k)
        if not memories:
            return ""

        import xml.sax.saxutils as saxutils

        lines = []
        for m in memories:
            date = m.created_at[:10] if m.created_at else "unknown"
            safe_content = saxutils.escape(m.content)
            lines.append(
                f'<memory date="{date}" category="{saxutils.escape(m.category)}">'
                f"{safe_content}</memory>"
            )

        return "\n".join(lines)

    async def _ensure_lessons_collection(self) -> None:
        """교훈 컬렉션이 없으면 생성한다."""
        try:
            result = await with_retry(
                lambda: asyncio.to_thread(self._qdrant.get_collections),
                max_retries=3, label="Qdrant get_collections(lessons)",
            )
            if not any(c.name == LESSONS_COLLECTION for c in result.collections):
                await with_retry(
                    lambda: asyncio.to_thread(
                        self._qdrant.create_collection,
                        collection_name=LESSONS_COLLECTION,
                        vectors_config=VectorParams(
                            size=EMBEDDING_DIM,
                            distance=Distance.COSINE,
                        ),
                    ),
                    max_retries=3, label="Qdrant create_collection(lessons)",
                )
                log.info("Lessons collection created")
        except Exception as e:
            log.warning("Failed to ensure lessons collection", err=str(e))

    async def index_lessons(self, file_path: str) -> int:
        """SHARED_LESSONS.md를 파싱하여 교훈을 벡터 저장한다.

        Returns: 인덱싱된 교훈 수.
        """
        import re

        await self._ensure_lessons_collection()

        try:
            from pathlib import Path
            content = await asyncio.to_thread(
                Path(file_path).read_text, "utf-8", "replace",
            )
        except Exception as e:
            log.warning("Failed to read lessons file", path=file_path, err=str(e))
            return 0

        # 마크다운 섹션 분리 (## 또는 - 항목 기준)
        lessons: list[str] = []
        for block in re.split(r"\n(?=##\s|[-*]\s\*\*)", content):
            block = block.strip()
            if len(block) > 20:  # 너무 짧은 블록 무시
                lessons.append(block[:MAX_CONTENT_LENGTH])

        if not lessons:
            return 0

        # 기존 컬렉션 비우고 재인덱싱
        try:
            await with_retry(
                lambda: asyncio.to_thread(
                    self._qdrant.delete_collection,
                    collection_name=LESSONS_COLLECTION,
                ),
                max_retries=2, label="Qdrant delete_collection(lessons)",
            )
            await self._ensure_lessons_collection()
        except Exception:
            pass

        points: list[PointStruct] = []
        embeddings = list(self._embed(lessons))
        for i, (lesson, emb) in enumerate(zip(lessons, embeddings, strict=False)):
            vector = emb.tolist() if hasattr(emb, "tolist") else emb
            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={"content": lesson, "index": i},
            ))

        if points:
            await with_retry(
                lambda: asyncio.to_thread(
                    self._qdrant.upsert,
                    collection_name=LESSONS_COLLECTION,
                    points=points,
                ),
                max_retries=3, label="Qdrant upsert(lessons)",
            )

        log.info("Lessons indexed", count=len(points), path=file_path)
        return len(points)

    async def search_lessons(
        self, query: str, top_k: int = 5, min_score: float = 0.3,
    ) -> list[str]:
        """태스크와 관련된 교훈을 검색한다. 문자열 리스트로 반환."""
        await self._ensure_lessons_collection()

        embeddings = list(self._embed([query]))
        if not embeddings:
            return []

        query_vector = embeddings[0]
        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        try:
            result = await with_retry(
                lambda: asyncio.to_thread(
                    self._qdrant.query_points,
                    collection_name=LESSONS_COLLECTION,
                    query=query_vector,
                    limit=top_k,
                ),
                max_retries=3, label="Qdrant query_points(lessons)",
            )
            hits = result.points
        except Exception as e:
            log.warning("Lessons search failed", err=str(e))
            return []

        lessons: list[str] = []
        for hit in hits:
            score = hit.score if hit.score is not None else 0.0
            if score < min_score:
                continue
            payload = hit.payload or {}
            content = payload.get("content", "")
            if content:
                lessons.append(content)

        return lessons

    async def save_conversation_summary(
        self,
        summary: str,
        decisions: list[str],
        session_id: str,
    ) -> list[str]:
        """대화 요약과 결정 사항을 기억으로 저장한다."""
        ids: list[str] = []

        if summary:
            mid = await self.save(
                content=summary,
                category="context",
                source="director",
                metadata={"session_id": session_id},
            )
            ids.append(mid)

        for decision in decisions:
            mid = await self.save(
                content=decision,
                category="decision",
                source="director",
                metadata={"session_id": session_id},
            )
            ids.append(mid)

        log.info("Conversation memories saved",
                 session_id=session_id, count=len(ids))
        return ids
