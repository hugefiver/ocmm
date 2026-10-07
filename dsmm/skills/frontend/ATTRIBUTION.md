# Frontend attribution and materialization notice

This DSMM frontend skill adapts OCMM's declared frontend library. OCMM project-original text and DSMM modifications remain under the package's complete LicenseRef-AAAPL LICENSE. The separable third-party files below retain their original licenses/notices; they are not represented as AAAPL-only or relicensed.

## Exact source recipe

The maintainer recipe is scripts/frontend-recipe.mjs, based on OCMM root skills/frontend/ATTRIBUTION.md and the complete root design _INDEX.md. There is no packages/shared-skills checkout or submodule assumption in DSMM. Run the explicitly authorized pnpm run sync:frontend command to fetch immutable GitHub content; ordinary build/check is offline and refuses missing or changed resources. Third-party body/data/Python files are gitignored, but the complete materialized tree and integrity/provenance inventory must ship in the package. Ignored status is not permission to omit distribution resources.

### Open Design

- Source: https://github.com/nexu-io/open-design
- Exact commit: 6afe7eae156bfa29251a51fd0636649c257f7444
- Copyright 2026 Open Design contributors; Apache-2.0, full fixed-pin text in LICENSE-Apache-2.0.txt.
- Each brand named in the index's Layer B table maps from design-systems/<brand>/DESIGN.md, replacing dots with dashes in the upstream directory name. aside.md is OCMM project-original and is never overwritten by an upstream file.
- No root NOTICE exists in this fixed tree (the parent's official API check returned 404); no notice is fabricated. Applicable notices in copied source files are retained.
- The index's historical VoltAgent/awesome-design-md attribution is preserved as lineage, not falsely declared the fetched vendor. This distribution's actual brand source is the fixed Open Design commit above.

### taste-skill

- Source: https://github.com/Leonxlnx/taste-skill
- Exact commit: 06d6028b5c623016c59ce8536f578e5a1127b499
- Copyright (c) 2026 Leonxlnx; MIT, full text in LICENSE-taste-skill.txt.
- The 12 declared style/image references map from skills/<name>/SKILL.md; imagegen-brandkit maps from skills/brandkit/SKILL.md. stitch-design-example.md maps from skills/stitch-skill/DESIGN.md. No other taste pin, HEAD or OMO directory is used.

### UI/UX Pro Max

- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Exact commit: f32d6a61cdf0bfd57404c45854583fd19ff95088
- Copyright (c) 2024 Next Level Builder; MIT, full text in LICENSE-ui-ux-pro-max.txt.
- README maps from .claude/skills/ui-ux-pro-max/SKILL.md. core.py, design_system.py, search.py and CSV data map from src/ui-ux-pro-max.
- web-interface.csv maps from app-interface.csv. The original app-interface.csv name is shipped too because verbatim core.py consumes it. google-fonts.csv and threejs/angular/laravel stacks are actual dependencies at this pin, not invented data. Python imports only the shipped core/design_system siblings and standard library; these resources are not executed during synchronization/build.

## Modifications and authority

Third-party body/data/Python/license bytes are copied verbatim; path mapping and the app-interface/web-interface alias are the only resource layout changes. OCMM/DSMM's project-original router, index and authority notes explain native DSH usage without rewriting third-party source. Source host/tool/platform names in a reference are not evidence that those tools or models are installed in DSH. Use actual native catalog capabilities and the resourceBase from native skill loading; software installation, downloads outside this explicit materialization operation, login, Git writes and destructive actions require exact authorization. No referenced code is executed by the materializer.

Product names, brands, typefaces and trademarks remain their owners' property. These references grant no trademark, font-binary, logo or proprietary-asset rights, and do not imply affiliation or endorsement. Fixed LICENSE texts were inspected for redistribution permission; this is not a comprehensive legal review, non-infringement opinion or DMCA guarantee.
