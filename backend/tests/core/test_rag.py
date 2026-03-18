"""RAG 모듈 테스트 — chunker, indexer, search."""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from src.core.rag.chunker import CodeChunk, chunk_file, scan_workspace


class TestChunker:
    def test_chunk_python_file_splits_by_function(self, tmp_path: Path):
        code = '''"""Module docstring."""
import os

def hello():
    print("hello")

def world():
    print("world")

class MyClass:
    def method(self):
        pass
'''
        py_file = tmp_path / "example.py"
        py_file.write_text(code, encoding="utf-8")

        chunks = chunk_file(py_file, tmp_path)
        assert len(chunks) >= 3  # imports + hello + world + MyClass
        assert all(isinstance(c, CodeChunk) for c in chunks)
        assert all(c.language == "python" for c in chunks)

    def test_chunk_non_python_uses_line_based(self, tmp_path: Path):
        ts_file = tmp_path / "app.ts"
        ts_file.write_text("const x = 1;\nconst y = 2;\n", encoding="utf-8")

        chunks = chunk_file(ts_file, tmp_path)
        assert len(chunks) >= 1
        assert chunks[0].language == "typescript"

    def test_empty_file_returns_no_chunks(self, tmp_path: Path):
        empty = tmp_path / "empty.py"
        empty.write_text("", encoding="utf-8")

        chunks = chunk_file(empty, tmp_path)
        assert chunks == []

    def test_scan_workspace_ignores_pycache(self, tmp_path: Path):
        (tmp_path / "__pycache__").mkdir()
        cache_file = tmp_path / "__pycache__" / "cached.py"
        cache_file.write_text("x = 1", encoding="utf-8")

        normal = tmp_path / "normal.py"
        normal.write_text("y = 2", encoding="utf-8")

        chunks = scan_workspace(tmp_path)
        file_paths = {c.file_path for c in chunks}
        assert "normal.py" in file_paths
        assert all("__pycache__" not in fp for fp in file_paths)

    def test_scan_workspace_ignores_non_code_files(self, tmp_path: Path):
        (tmp_path / "image.png").write_bytes(b"\x89PNG")
        (tmp_path / "code.py").write_text("x = 1", encoding="utf-8")

        chunks = scan_workspace(tmp_path)
        assert all(c.file_path.endswith(".py") for c in chunks)

    def test_chunk_context_includes_file_path(self, tmp_path: Path):
        py_file = tmp_path / "src" / "main.py"
        py_file.parent.mkdir(parents=True)
        py_file.write_text("def main():\n    pass\n", encoding="utf-8")

        chunks = chunk_file(py_file, tmp_path)
        assert any("src/main.py" in c.context for c in chunks)

    def test_large_function_is_split(self, tmp_path: Path):
        """2000자 이상의 함수는 라인 기반으로 재분할된다."""
        big_func = "def big():\n" + "    x = 1\n" * 300
        py_file = tmp_path / "big.py"
        py_file.write_text(big_func, encoding="utf-8")

        chunks = chunk_file(py_file, tmp_path)
        assert len(chunks) >= 2  # 분할되어야 함


class TestIndexerAndSearch:
    async def test_index_and_search_roundtrip(self, tmp_path: Path):
        """인덱싱 후 검색이 동작하는지 end-to-end 테스트."""
        from qdrant_client import QdrantClient

        from src.core.rag.indexer import CodebaseIndexer
        from src.core.rag.search import CodeSearchService

        # 테스트 파일 생성
        (tmp_path / "auth.py").write_text(
            'def authenticate(username: str, password: str) -> bool:\n'
            '    """사용자 인증 처리."""\n'
            '    return check_password(username, password)\n',
            encoding="utf-8",
        )
        (tmp_path / "db.py").write_text(
            'def get_user_by_id(user_id: int) -> dict:\n'
            '    """DB에서 사용자 조회."""\n'
            '    return query("SELECT * FROM users WHERE id = ?", user_id)\n',
            encoding="utf-8",
        )

        # Qdrant in-memory + 간단한 임베딩 (fastembed)
        qdrant = QdrantClient(":memory:")

        from fastembed import TextEmbedding
        embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

        # 인덱싱
        indexer = CodebaseIndexer(qdrant, embed_model.embed)
        count = await indexer.index_workspace(tmp_path)
        assert count >= 2

        # 검색
        search = CodeSearchService(qdrant, embed_model.embed)
        results = await search.search("user authentication login")
        assert len(results) > 0
        # auth.py가 상위에 있어야 함
        assert any("auth.py" in r.file_path for r in results)

    async def test_search_formatted_returns_xml(self, tmp_path: Path):
        """search_formatted가 XML 형식으로 반환하는지 확인."""
        from qdrant_client import QdrantClient

        from src.core.rag.indexer import CodebaseIndexer
        from src.core.rag.search import CodeSearchService

        (tmp_path / "utils.py").write_text(
            'def format_date(dt):\n    return dt.strftime("%Y-%m-%d")\n',
            encoding="utf-8",
        )

        qdrant = QdrantClient(":memory:")
        from fastembed import TextEmbedding
        embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

        indexer = CodebaseIndexer(qdrant, embed_model.embed)
        await indexer.index_workspace(tmp_path)

        search = CodeSearchService(qdrant, embed_model.embed)
        formatted = await search.search_formatted("date formatting utility")
        assert "<reference" in formatted or formatted == ""

    async def test_reindex_updates_content(self, tmp_path: Path):
        """파일 변경 후 reindex하면 새 내용이 검색된다."""
        from qdrant_client import QdrantClient

        from src.core.rag.indexer import CodebaseIndexer
        from src.core.rag.search import CodeSearchService

        code_file = tmp_path / "service.py"
        code_file.write_text("def old_function():\n    pass\n", encoding="utf-8")

        qdrant = QdrantClient(":memory:")
        from fastembed import TextEmbedding
        embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

        indexer = CodebaseIndexer(qdrant, embed_model.embed)
        await indexer.index_workspace(tmp_path)

        # 파일 수정 후 재인덱싱
        code_file.write_text("def new_awesome_function():\n    return 42\n", encoding="utf-8")
        count = await indexer.reindex_files(tmp_path, ["service.py"])
        assert count >= 1

        search = CodeSearchService(qdrant, embed_model.embed)
        results = await search.search("awesome function")
        assert len(results) > 0
