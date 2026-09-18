from __future__ import annotations

import re
import unittest
from pathlib import Path

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SWIFTUI_IMPORT = re.compile(
    r"^\s*(?:@testable\s+)?import\s+"
    r"(?:(?:class|enum|func|protocol|struct|typealias|var)\s+)?"
    r"SwiftUI(?:\.|\s*$)",
    re.MULTILINE,
)


def load_yaml(path: str) -> dict[str, object]:
    contents = (REPOSITORY_ROOT / path).read_text(encoding="utf-8")
    document = yaml.safe_load(contents)
    if not isinstance(document, dict):
        raise AssertionError(f"Expected {path} to contain a YAML mapping")
    return document


class MilestoneOneBootstrapTests(unittest.TestCase):
    def test_swiftui_iphone_project_files_exist(self) -> None:
        required_paths = (
            "project.yml",
            "Package.swift",
            "apps/ios/InterMEDApp/App/InterMEDApp.swift",
            "apps/ios/InterMEDApp/Features/Home/HomeView.swift",
        )

        missing = [
            path for path in required_paths if not (REPOSITORY_ROOT / path).is_file()
        ]

        self.assertEqual([], missing, f"Missing iOS bootstrap files: {missing}")

        app_source = (
            REPOSITORY_ROOT / "apps/ios/InterMEDApp/App/InterMEDApp.swift"
        ).read_text(encoding="utf-8")
        project = load_yaml("project.yml")

        self.assertRegex(app_source, SWIFTUI_IMPORT)
        self.assertIn("@main", app_source)
        device_family = project["targets"]["InterMED"]["settings"]["base"][
            "TARGETED_DEVICE_FAMILY"
        ]
        self.assertEqual("1", device_family)

    def test_architecture_boundaries_mirror_the_required_layers(self) -> None:
        required_directories = (
            "apps/ios/InterMEDApp/Features",
            "apps/ios/InterMEDApp/DesignSystem",
            "apps/ios/InterMEDApp/Platform",
            "packages/domain/Sources/InterMEDDomain",
            "packages/clinical-engine/Sources/InterMEDClinicalEngine",
            "packages/evidence/Sources/InterMEDEvidence",
            "packages/medication/Sources/InterMEDMedication",
            "packages/terminology/Sources/InterMEDTerminology",
            "packages/test-fixtures/Sources/InterMEDTestFixtures",
        )

        missing = [
            path for path in required_directories if not (REPOSITORY_ROOT / path).is_dir()
        ]

        self.assertEqual([], missing, f"Missing architecture boundaries: {missing}")

        manifest = (REPOSITORY_ROOT / "Package.swift").read_text(encoding="utf-8")
        self.assertIn('name: "InterMEDDomain"', manifest)
        self.assertNotRegex(
            manifest.lower(),
            re.compile(r"appwrite|firebase|supabase|amplify"),
            "MVP package manifest must not introduce a backend SDK",
        )

    def test_domain_module_does_not_import_swiftui(self) -> None:
        domain_root = REPOSITORY_ROOT / "packages/domain"
        swift_files = list(domain_root.rglob("*.swift"))

        self.assertTrue(swift_files, "Domain module must contain Swift sources")
        offenders = [
            str(path.relative_to(REPOSITORY_ROOT))
            for path in swift_files
            if SWIFTUI_IMPORT.search(path.read_text(encoding="utf-8"))
        ]
        self.assertEqual([], offenders, f"Domain imports SwiftUI: {offenders}")

    def test_swiftui_import_detection_accepts_swift_whitespace(self) -> None:
        self.assertRegex("import\tSwiftUI\n", SWIFTUI_IMPORT)
        self.assertRegex("import struct SwiftUI.View\n", SWIFTUI_IMPORT)

    def test_swiftlint_configuration_exists(self) -> None:
        config = REPOSITORY_ROOT / ".swiftlint.yml"

        self.assertTrue(config.is_file(), "Expected a repository SwiftLint config")
        contents = config.read_text(encoding="utf-8")
        self.assertIn("strict: true", contents)
        self.assertIn("packages", contents)
        self.assertIn("apps", contents)

    def test_coderabbit_reviews_pull_requests_targeting_any_branch(self) -> None:
        config_path = REPOSITORY_ROOT / ".coderabbit.yaml"

        self.assertTrue(
            config_path.is_file(), "Expected repository CodeRabbit config"
        )
        config = load_yaml(".coderabbit.yaml")
        auto_review = config["reviews"]["auto_review"]
        self.assertIs(True, auto_review["enabled"])
        self.assertIs(True, auto_review["drafts"])
        self.assertIn(".*", auto_review["base_branches"])


if __name__ == "__main__":
    unittest.main()
