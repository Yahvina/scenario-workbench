import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/gcam_steel_overlay.py'
spec = importlib.util.spec_from_file_location('steel_overlay', SCRIPT)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class SteelOverlayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.steel = self.folder / '钢铁 input.xml'
        self.electricity = self.folder / 'electricity.xml'
        self.steel.write_text('''<scenario><world><region name="HE">
          <unlimited-resource name="scrap"><output-unit>Mt</output-unit></unlimited-resource>
          <supplysector name="iron and steel"><output-unit>Mt</output-unit>
            <subsector name="EAF with scrap"><stub-technology name="EAF with scrap">
              <period year="2030"><share-weight>1</share-weight>
                <minicam-energy-input name="elect_td_ind"><market-name>HE</market-name><coefficient>2</coefficient></minicam-energy-input>
                <minicam-energy-input name="scrap"><market-name>HE</market-name><coefficient>3</coefficient></minicam-energy-input>
              </period>
              <period year="2035"><minicam-energy-input name="elect_td_ind"><market-name>HE</market-name><coefficient>4</coefficient></minicam-energy-input></period>
            </stub-technology></subsector></supplysector></region></world></scenario>''', encoding='utf-8')
        self.electricity.write_text('<scenario><world><region name="HE"><supplysector name="elect_td_ind"><output-unit>EJ</output-unit></supplysector></region></world></scenario>', encoding='utf-8')
        self.request = {'format': adapter.FORMAT, 'version': 1, 'testOnly': True,
            'source': self.source(self.steel),
            'target': {'region': 'HE', 'sector': 'iron and steel', 'subsector': 'EAF with scrap', 'technology': 'EAF with scrap', 'year': 2030, 'input': 'elect_td_ind', 'expectedBaseline': 2, 'unit': 'EJ/Mt'},
            'commodity': {**self.source(self.electricity), 'region': 'HE', 'kind': 'supplysector', 'name': 'elect_td_ind'},
            'operation': {'kind': 'coefficient-decrease-percent', 'value': 5}}
        self.destination = self.folder / 'generated'

    def source(self, path):
        return {'path': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

    def prepare(self):
        return adapter.prepare_overlay(self.request, self.folder)

    def alter(self, change):
        tree = ET.parse(self.steel)
        change(tree.getroot())
        tree.write(self.steel, encoding='utf-8')
        self.request['source'] = self.source(self.steel)

    def reject(self):
        with self.assertRaises(adapter.OverlayError):
            adapter.generate_bundle(self.request, self.destination, self.folder)
        self.assertFalse(self.destination.exists())

    def test_exact_one_leaf_with_preserved_ancestry(self):
        xml, audit, _ = self.prepare()
        root = ET.fromstring(xml)
        self.assertEqual(len(list(root.iter())), 9)
        self.assertEqual(root.find('./world/region').get('name'), 'HE')
        self.assertEqual(root.find('.//period').get('year'), '2030')
        self.assertEqual(root.find('.//minicam-energy-input').get('name'), 'elect_td_ind')
        self.assertAlmostEqual(float(root.find('.//coefficient').text), 1.9)
        self.assertIsNone(root.find('.//share-weight'))
        self.assertEqual(audit['leafChanges'], 1)
        self.assertFalse(audit['researchMappingApproved'])
        self.assertFalse(audit['cibConsistencyEvaluated'])

    def test_four_operations_have_different_semantics(self):
        for kind, value, expected in [('coefficient-multiplier', .95, 1.9), ('set-coefficient', 8, 8), ('coefficient-decrease-percent', 5, 1.9), ('reciprocal-efficiency-increase-percent', 5, 2 / 1.05)]:
            with self.subTest(kind=kind):
                self.request['operation'] = {'kind': kind, 'value': value}
                self.assertAlmostEqual(self.prepare()[1]['writtenCoefficient'], expected)

    def test_zero_is_valid_and_not_blank(self):
        for kind, expected in [('set-coefficient', 0), ('coefficient-multiplier', 0), ('coefficient-decrease-percent', 2), ('reciprocal-efficiency-increase-percent', 2)]:
            self.request['operation'] = {'kind': kind, 'value': 0}
            self.assertEqual(self.prepare()[1]['writtenCoefficient'], expected)

    def test_hundred_percent_decrease_can_explicitly_write_zero(self):
        self.request['operation']['value'] = 100
        self.assertEqual(self.prepare()[1]['writtenCoefficient'], 0)

    def test_material_unit_from_same_source(self):
        self.request['target'].update(input='scrap', expectedBaseline=3, unit='Mt/Mt')
        self.request['commodity'] = {**self.source(self.steel), 'region': 'HE', 'kind': 'unlimited-resource', 'name': 'scrap'}
        self.assertEqual(self.prepare()[1]['coefficientUnit'], 'Mt/Mt')

    def test_complete_bundle_reproducible_and_sources_unchanged(self):
        before = self.steel.read_bytes(), self.electricity.read_bytes()
        first = adapter.generate_bundle(self.request, self.destination, self.folder)
        second = adapter.generate_bundle(self.request, self.folder / 'second', self.folder)
        self.assertEqual(first, second)
        self.assertEqual((self.destination / 'overlay.xml').read_bytes(), (self.folder / 'second/overlay.xml').read_bytes())
        self.assertEqual((self.steel.read_bytes(), self.electricity.read_bytes()), before)
        self.assertEqual(json.loads((self.destination / 'audit.json').read_text(encoding='utf-8')), first)

    def test_existing_output_directory_never_overwritten(self):
        self.destination.mkdir()
        sentinel = self.destination / 'keep.txt'
        sentinel.write_text('existing output')
        with self.assertRaises(adapter.OverlayError):
            adapter.generate_bundle(self.request, self.destination, self.folder)
        self.assertEqual(sentinel.read_text(), 'existing output')

    def test_non_test_requests_rejected(self):
        for value in [False, None, 1, 'true']:
            self.request['testOnly'] = value
            self.reject()

    def test_blank_boolean_nonfinite_and_string_values_rejected(self):
        for value in ['', None, False, True, '5', float('inf'), float('nan'), 10 ** 500]:
            with self.subTest(value=str(value)[:25]):
                self.request['operation']['value'] = value
                self.reject()

    def test_invalid_baselines_rejected(self):
        for value in [None, '', True, -1, float('inf'), 2.0001]:
            self.request['target']['expectedBaseline'] = value
            self.reject()

    def test_negative_and_excess_percent_rejected(self):
        for value in [-1, 100.001]:
            self.request['operation']['value'] = value
            self.reject()

    def test_overflow_rejected(self):
        self.request['operation'] = {'kind': 'coefficient-multiplier', 'value': 1e308}
        self.reject()

    def test_wrong_or_ambiguous_units_rejected(self):
        for unit in ['EJ', 'Mt/Mt', '', 'kgce/t']:
            self.request['target']['unit'] = unit
            self.reject()

    def test_both_source_versions_checked(self):
        for role in ['source', 'commodity']:
            original = self.request[role]['sha256']
            self.request[role]['sha256'] = '0' * 64
            self.reject()
            self.request[role]['sha256'] = original

    def test_wrong_scope_fields_rejected(self):
        for field, value in [('region', 'UNKNOWN'), ('sector', 'cement'), ('subsector', 'missing'), ('technology', 'missing'), ('input', 'missing'), ('year', 2031), ('year', '2030'), ('year', True)]:
            original = self.request['target'][field]
            self.request['target'][field] = value
            self.reject()
            self.request['target'][field] = original

    def test_commodity_must_match_market_and_input(self):
        for field, value in [('region', 'OTHER'), ('name', 'scrap'), ('kind', 'depletable-resource')]:
            original = self.request['commodity'][field]
            self.request['commodity'][field] = value
            self.reject()
            self.request['commodity'][field] = original

    def test_duplicate_region_rejected(self):
        self.alter(lambda root: root.find('world').append(copy.deepcopy(root.find('.//region'))))
        self.reject()

    def test_duplicate_coefficient_rejected(self):
        self.alter(lambda root: ET.SubElement(root.find('.//minicam-energy-input'), 'coefficient').__setattr__('text', '2'))
        self.reject()

    def test_missing_coefficient_rejected(self):
        self.alter(lambda root: root.find('.//minicam-energy-input').remove(root.find('.//coefficient')))
        self.reject()

    def test_mixed_efficiency_and_coefficient_rejected(self):
        self.alter(lambda root: ET.SubElement(root.find('.//minicam-energy-input'), 'efficiency').__setattr__('text', '.5'))
        self.reject()

    def test_fillout_coefficient_rejected(self):
        self.alter(lambda root: root.find('.//coefficient').set('fillout', '1'))
        self.reject()
        self.alter(lambda root: root.find('.//coefficient').attrib.clear())
        self.alter(lambda root: ET.SubElement(root.find('.//coefficient'), 'unexpected'))
        self.reject()

    def test_missing_output_unit_rejected(self):
        self.alter(lambda root: root.find('.//supplysector').remove(root.find('.//supplysector/output-unit')))
        self.reject()

    def test_zero_baseline_and_undefined_reciprocal(self):
        self.alter(lambda root: setattr(root.find('.//coefficient'), 'text', '0'))
        self.request['target']['expectedBaseline'] = 0
        self.assertEqual(self.prepare()[1]['writtenCoefficient'], 0)
        self.request['operation'] = {'kind': 'reciprocal-efficiency-increase-percent', 'value': 5}
        self.reject()

    def test_source_rewrite_during_output_leaves_no_bundle(self):
        original = Path.write_bytes
        def write(path, data):
            result = original(path, data)
            if path.name == 'overlay.xml':
                self.steel.write_text('<scenario/>')
            return result
        with patch.object(Path, 'write_bytes', write):
            self.reject()
        self.assertEqual(list(self.folder.glob('.steel-overlay-*')), [])

    def test_unknown_fields_and_operations_rejected(self):
        self.request['reviewedForResearch'] = True
        self.reject()
        del self.request['reviewedForResearch']
        self.request['operation']['kind'] = 'share-weight'
        self.reject()

    def test_dtd_rejected(self):
        self.steel.write_text('<!DOCTYPE scenario [<!ENTITY x "data">]><scenario/>')
        self.request['source'] = self.source(self.steel)
        self.reject()

    def test_duplicate_json_keys_and_nonfinite_constants_rejected(self):
        file = self.folder / 'bad.json'
        for raw in ['{"version":1,"version":1}', '{"x":NaN}', '{"x":Infinity}']:
            file.write_text(raw)
            with self.assertRaises(adapter.OverlayError):
                adapter.load_request(file)

    def test_cli_accepts_relative_paths_and_fails_without_partial_output(self):
        file = self.folder / 'request.json'
        file.write_text(json.dumps(self.request, ensure_ascii=False), encoding='utf-8')
        args = [sys.executable, str(SCRIPT), '--request', str(file), '--out-dir', str(self.destination)]
        good = subprocess.run(args, capture_output=True, cwd=SCRIPT.parent)
        self.assertEqual(good.returncode, 0, good.stderr)
        self.assertTrue((self.destination / 'overlay.xml').is_file())
        self.request['operation']['value'] = None
        file.write_text(json.dumps(self.request), encoding='utf-8')
        bad = subprocess.run(args[:-1] + [str(self.folder / 'bad-output')], capture_output=True)
        self.assertNotEqual(bad.returncode, 0)
        self.assertFalse((self.folder / 'bad-output').exists())


if __name__ == '__main__':
    unittest.main()
