import json
from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase

from apps.evaluations import report_ai

ANSWER = {
    "headline": "Une organisation soudée autour de sa vision, freinée par ses cloisons internes",
    "sections": [
        {"theme": "Une adhésion réelle à la vision", "paragraphs": ["Premier paragraphe d'analyse.", "Second paragraphe."]},
        {"theme": "Des cloisons qui coûtent", "paragraphs": ["Analyse de la communication entre directions."]},
    ],
    "recommendations": [
        {"title": "Installer une gouvernance transverse", "rationale": "Parce que la communication horizontale est le critère le plus faible.",
         "owner": "Direction Générale", "horizon": "6 mois", "priority": "Haute", "kpi": "Critère communication horizontale >= 3,2"},
    ],
}


def fake_client(text, stop_reason="end_turn"):
    message = SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="thinking"), SimpleNamespace(type="text", text=text)])
    stream = mock.MagicMock()
    stream.__enter__.return_value.get_final_message.return_value = message
    client = mock.MagicMock()
    client.beta.messages.stream.return_value = stream
    return client


class StrategicSummaryTests(SimpleTestCase):
    def call(self, client, env=None):
        with mock.patch.dict("os.environ", env if env is not None else {"ANTHROPIC_API_KEY": "test"}, clear=False), \
                mock.patch("anthropic.Anthropic", return_value=client):
            return report_ai.strategic_summary("Rapport", "l'organisation", "2026", {"ICE": 3.4})

    def test_parses_the_structured_answer(self):
        client = fake_client(json.dumps(ANSWER))
        result = self.call(client)
        self.assertEqual(result.headline, ANSWER["headline"])
        self.assertEqual(result.sections[0], ("Une adhésion réelle à la vision", ["Premier paragraphe d'analyse.", "Second paragraphe."]))
        self.assertEqual(result.recommendations[0].priority, "Haute")
        kwargs = client.beta.messages.stream.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-opus-5-5")
        self.assertIn('"ICE": 3.4', kwargs["messages"][0]["content"])

    def test_falls_back_on_refusal_error_or_missing_key(self):
        # Rapport inconnu du moteur de règles : il ne reste que la rédaction automatique d'origine.
        self.assertIsNone(self.call(fake_client(json.dumps(ANSWER), stop_reason="refusal")))
        broken = mock.MagicMock()
        broken.beta.messages.stream.side_effect = RuntimeError("réseau")
        self.assertIsNone(self.call(broken))
        with mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}):
            self.assertIsNone(report_ai.strategic_summary("Rapport", "x", "2026", {}))
        self.assertFalse(report_ai.was_used())


class WorkspaceHeaderTests(SimpleTestCase):
    def test_workspace_header_is_sent_when_configured(self):
        client = fake_client(json.dumps(ANSWER))
        with mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test", "ANTHROPIC_WORKSPACE_ID": "wrkspc_123"}), \
                mock.patch("anthropic.Anthropic", return_value=client) as constructor:
            report_ai.strategic_summary("Rapport", "x", "2026", {})
        self.assertEqual(constructor.call_args.kwargs["default_headers"], {"anthropic-workspace-id": "wrkspc_123"})
