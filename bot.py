import os
import aiohttp
from datetime import date
from dotenv import load_dotenv
load_dotenv(override=True)

import db, tools as T
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair, LLMUserAggregatorParams)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.elevenlabs.stt import ElevenLabsSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.base_transport import TransportParams

db.init()

SYSTEM = f"""You are the receptionist voice agent for a clinic. Today is {date.today().isoformat()}.
You can check doctor availability, book, and cancel appointments.
Rules:
- Speak short, natural sentences. No lists, no markdown, no emojis. This is a phone call.
- Identify the caller ONLY by the phone number they say out loud. Ask for it before booking or cancelling.
- ALWAYS read the phone number back as separate digits with spaces, like "1 1 2 2 3 3 4 4 5 5", never as one big number, and wait for a clear yes before calling book_appointment or cancel_appointment.
- Before booking, ask for the caller's name and pass it as patient_name.
- Offer at most 3 slots at a time. Resolve dates like 'tomorrow' using today's date.
- Never invent slots; use check_doctor_availability. If a slot is taken, apologise and offer others.
- If the caller's number is not 10 digits, ask them to repeat it.
- Greet the caller briefly to start.
- Speak in one or two complete sentences per turn. Never repeat a sentence you already said.
- Do not use filler words or interjections like "uh", "um", "hmm", "ah"."""

transport_params = {
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


async def run_bot(transport):
    async with aiohttp.ClientSession() as session:
        stt = ElevenLabsSTTService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            aiohttp_session=session,
            settings=ElevenLabsSTTService.Settings(language="en"),
        )
        tts = ElevenLabsTTSService(api_key=os.getenv("ELEVENLABS_API_KEY"), voice_id=os.getenv("ELEVENLABS_VOICE_ID"), model="eleven_flash_v2_5")
        
        llm = GoogleLLMService(
            api_key=os.getenv("GOOGLE_API_KEY"),
            model="gemini-3.5-flash-lite",
        )
        llm.register_function("check_doctor_availability", T.check_doctor_availability)
        llm.register_function("book_appointment", T.book_appointment)
        llm.register_function("cancel_appointment", T.cancel_appointment)

        context = LLMContext([{"role": "system", "content": SYSTEM}], T.tools)
        agg = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
        )

        pipeline = Pipeline([transport.input(), stt, agg.user(), llm, tts,
                             transport.output(), agg.assistant()])
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True))

        @transport.event_handler("on_client_connected")
        async def _c(t, client):
            await task.queue_frames([LLMRunFrame()])

        @transport.event_handler("on_client_disconnected")
        async def _d(t, client):
            await task.cancel()

        await PipelineRunner(handle_sigint=False).run(task)


async def bot(runner_args: RunnerArguments):
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()