"""BaseCodeGeneratorAgent._is_likely_truncated 테스트."""
import pytest

from src.core.agent.base_code_generator import BaseCodeGeneratorAgent


class TestIsLikelyTruncated:
    detect = staticmethod(BaseCodeGeneratorAgent._is_likely_truncated)

    def test_complete_python_file(self):
        code = 'def hello():\n    return "world"\n'
        assert self.detect(code, "app.py") is False

    def test_truncated_python_unbalanced_brackets(self):
        code = 'def hello():\n    data = {\n        "key": {\n            "nested": [\n'
        assert self.detect(code, "app.py") is True

    def test_complete_typescript_file(self):
        code = 'function hello() {\n  return "world";\n}\n'
        assert self.detect(code, "app.ts") is False

    def test_truncated_typescript_unbalanced_braces(self):
        code = 'export function App() {\n  const data = {\n    items: [\n      { id: 1,\n'
        assert self.detect(code, "App.tsx") is True

    def test_line_ending_with_comma(self):
        code = 'const config = {\n  host: "localhost",\n  port: 3000,\n  db:'
        assert self.detect(code, "config.ts") is True

    def test_line_ending_with_arrow(self):
        code = 'const handler = (req, res) =>'
        assert self.detect(code, "handler.ts") is True

    def test_line_ending_with_colon(self):
        code = 'class Foo:\n    def bar(self):'
        assert self.detect(code, "foo.py") is True

    def test_empty_content(self):
        assert self.detect("", "empty.py") is False

    def test_small_bracket_imbalance_ok(self):
        # 1-2개 차이는 정상 (f-string, 정규식 등)
        code = 'pattern = re.compile(r"({test}")\n'
        assert self.detect(code, "util.py") is False

    def test_non_code_file_only_checks_last_line(self):
        code = "# Just a comment\nsome text\n"
        assert self.detect(code, "readme.md") is False
