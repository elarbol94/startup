# Unit tests for the speaker assignment (no GPU needed): python3 -m unittest test_pipeline
import unittest

import tempfile
import wave
from pathlib import Path

from pipeline import assign_speakers, cut_wav, plan_chunks, shift


def word(start, end, text):
    return {"start": start, "end": end, "word": text}


class AssignSpeakersTest(unittest.TestCase):
    def test_splits_a_segment_where_the_speaker_changes(self):
        segments = [{"start": 0, "end": 4, "text": "", "words": [word(0, 1, " Guten"), word(1, 2, " Morgen."), word(2.5, 3, " Hallo"), word(3, 4, " Felix.")]}]
        turns = [(0, 2.2, "SPEAKER_00"), (2.3, 4, "SPEAKER_01")]
        self.assertEqual(assign_speakers(segments, turns), [
            {"start": 0, "end": 2, "speaker": "SPEAKER_00", "text": "Guten Morgen."},
            {"start": 2.5, "end": 4, "speaker": "SPEAKER_01", "text": "Hallo Felix."},
        ])

    def test_gives_a_word_in_a_pause_to_the_nearest_turn(self):
        segments = [{"start": 10, "end": 11, "text": " Ja.", "words": [word(10, 11, " Ja.")]}]
        turns = [(0, 5, "SPEAKER_00"), (11.5, 20, "SPEAKER_01")]
        self.assertEqual(assign_speakers(segments, turns)[0]["speaker"], "SPEAKER_01")

    def test_falls_back_to_one_speaker_without_turns_or_words(self):
        segments = [{"start": 0, "end": 2, "text": " Nur Text ", "words": []}]
        self.assertEqual(assign_speakers(segments, []), [{"start": 0, "end": 2, "speaker": "A", "text": "Nur Text"}])


class ChunkingTest(unittest.TestCase):
    def test_keeps_short_recordings_whole(self):
        self.assertEqual(plan_chunks(500, [100, 300], 600), [(0, 500)])

    def test_cuts_at_the_last_silence_in_the_second_half_of_each_window(self):
        # 400 s is in the second half of the first window (300-600), 250 s is not.
        self.assertEqual(plan_chunks(1300, [250, 400, 700, 950], 600), [(0, 400), (400, 950), (950, 1300)])

    def test_falls_back_to_a_hard_cut_without_a_usable_silence(self):
        self.assertEqual(plan_chunks(1300, [10], 600), [(0, 600), (600, 1200), (1200, 1300)])

    def test_shifts_segments_and_words_onto_the_recording_timeline(self):
        segment = {"start": 1.0, "end": 2.0, "text": " Ja.", "words": [{"start": 1.0, "end": 2.0, "word": " Ja."}]}
        self.assertEqual(shift(segment, 600), {"start": 601.0, "end": 602.0, "text": " Ja.", "words": [{"start": 601.0, "end": 602.0, "word": " Ja."}]})

    def test_cuts_a_wav_range_without_changing_its_format(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp) / "a.wav", Path(tmp) / "b.wav"
            with wave.open(str(source), "wb") as writer:
                writer.setnchannels(1)
                writer.setsampwidth(2)
                writer.setframerate(16000)
                writer.writeframes(bytes(range(256)) * 250)  # 64000 bytes = 2 s
            cut_wav(source, target, 0.5, 1.5)
            with wave.open(str(target)) as reader:
                self.assertEqual((reader.getframerate(), reader.getnchannels(), reader.getnframes()), (16000, 1, 16000))


if __name__ == "__main__":
    unittest.main()
