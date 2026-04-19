# HarnessAI 벤치마크 결과

- Python: 3.12.12
- Iterations: 30
- 측정 항목: LLM 호출 없이 측정 가능한 부분만

## 요약

| 측정 | mean | median | p_min | p_max |
|---|---|---|---|---|
| profile_detect | 4.70 ms | 4.26 ms | 3.88 ms | 10.35 ms |
| skeleton_assemble | 0.13 ms | 0.01 ms | 0.01 ms | 3.48 ms |
| harness_validate | 149.19 ms | 146.00 ms | 139.65 ms | 174.26 ms |
| harness_integrity | 104.09 ms | 104.30 ms | 96.88 ms | 119.15 ms |
| find_placeholders (small_100B) | 0.01 ms | 0.00 ms | 0.00 ms | 0.09 ms |
| find_placeholders (medium_10KB) | 0.02 ms | 0.02 ms | 0.02 ms | 0.02 ms |
| find_placeholders (large_100KB) | 0.14 ms | 0.14 ms | 0.14 ms | 0.17 ms |

## 상세

### profile_detect
- **대상**: fastapi 프로파일 감지 (샘플 pyproject.toml)
- mean **4.70 ms** (±1.24), median 4.26 ms, range [3.88, 10.35]

### skeleton_assemble
- **대상**: 20 섹션 전체 조립
- mean **0.13 ms** (±0.63), median 0.01 ms, range [0.01, 3.48]

### harness_validate
- **대상**: 27 파일 스키마 검증 (subprocess)
- mean **149.19 ms** (±7.06), median 146.00 ms, range [139.65, 174.26]

### harness_integrity
- **대상**: clean skeleton (5 파일) 대상 integrity
- mean **104.09 ms** (±4.30), median 104.30 ms, range [96.88, 119.15]

### find_placeholders
- **대상**: find_placeholders 스케일링
- `small_100B` (23B): mean 0.01 ms (±0.02)
- `medium_10KB` (11210B): mean 0.02 ms (±0.00)
- `large_100KB` (112010B): mean 0.14 ms (±0.01)
