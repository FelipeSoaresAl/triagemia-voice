import './style.css';
import { tool } from '@openai/agents';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { z } from 'zod';

// --- Elementos da UI ---
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const doctorBtn = document.getElementById('doctor-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const reportContainer = document.getElementById('report-container')!;
const reportOutput = document.getElementById('report-output')!;

// Variável global da sessão
let session: RealtimeSession | null = null;

// --- 1. Instruções (Prompt) ---
const INSTRUCTIONS = `
Você é a 'Vexis Triagem', uma assistente de voz focada.
Sua função é preencher um formulário de triagem. Fale Português do Brasil.

ESTRUTURA (UMA PERGUNTA POR VEZ):
1. Queixa Principal?
2. Tempo?
3. Intensidade (0-10)?
4. Outros sintomas/Remédios?

REGRAS DE ENCERRAMENTO:
A) SUCESSO (Fim normal): Diga "Entendido. Salvando dados." e chame a tool 'save_triage_report'.
B) MÉDICO CHEGOU (Interrupção): Se receber o evento [MEDICO_ENTROU], NÃO FALE NADA. Fique em silêncio absoluto. Apenas chame a tool com doctor_interrupted=true imediatamente.

IMPORTANTE: Se o médico entrar, sua prioridade é SILÊNCIO e SALVAR.
`;

// --- 2. Definição da Ferramenta ---
const saveTriageReportTool = tool({
  name: 'save_triage_report',
  description: 'Salva a triagem e Encerra a chamada.',
  parameters: z.object({
    summary: z.string(),
    symptoms: z.array(z.string()),
    suggested_urgency: z.enum(['EMERGENCIA', 'URGENTE', 'NAO_URGENTE', 'ORIENTACAO']),
    doctor_interrupted: z.boolean(),
  }),
  execute: async (args) => {
    console.log("📝 Relatório Gerado:", args);
    
    // Atualiza a tela
    reportContainer.style.display = 'block';
    reportOutput.textContent = JSON.stringify(args, null, 2);
    
    statusEl.innerText = args.doctor_interrupted 
      ? "🚨 MÉDICO NA SALA. Desconectado (Silencioso)." 
      : "✅ Triagem Concluída.";
    
    statusEl.style.color = args.doctor_interrupted ? 'orange' : '#4caf50';

    if (session) {
        if (args.doctor_interrupted) {
            // --- CORTE IMEDIATO (Médico) ---
            // Sem delay. Sem tchau. Desconecta na hora.
            console.log("Corte imediato solicitado.");
            (session as any).disconnect();
        } else {
            // --- CORTE NORMAL (Sucesso) ---
            // Delay de 2.5s para ela terminar de falar "Salvando dados..."
            setTimeout(() => {
                (session as any).disconnect(); 
            }, 2500);
        }

        // Reseta botões
        startBtn.style.display = 'inline-block';
        startBtn.innerText = "Nova Triagem";
        doctorBtn.classList.remove('active');
    }

    return "SESSION_TERMINATED";
  }
});

// --- 3. Função de Conexão ---
async function startSession() {
  const ephemeralKey = prompt("Cole sua chave efêmera (ek_...) aqui:");
  
  if (!ephemeralKey || !ephemeralKey.startsWith('ek_')) {
      alert("Chave inválida. Gere uma nova no Insomnia.");
      return;
  }

  statusEl.innerText = "Conectando...";
  reportContainer.style.display = 'none';

  const agent = new RealtimeAgent({
    name: 'Vexis Voice',
    instructions: INSTRUCTIONS,
    tools: [saveTriageReportTool],
  });

  session = new RealtimeSession(agent, {
    model: 'gpt-4o-realtime-preview',
  });

  try {
    await session.connect({ apiKey: ephemeralKey.trim() });
    
    statusEl.innerText = "🟢 Ouvindo... (Relate os sintomas)";
    statusEl.style.color = "#4caf50";
    startBtn.style.display = 'none';
    doctorBtn.classList.add('active');

  } catch (e) {
    console.error(e);
    statusEl.innerText = "Erro ao conectar.";
    alert("Erro na conexão. Verifique se a chave não expirou.");
  }
}

// --- 4. Evento do Médico (SILÊNCIO ABSOLUTO) ---
doctorBtn.addEventListener('click', () => {
  if (!session) return;
  console.log("🚨 Botão Médico: Ordem de silêncio.");

  // 1. Injeta o comando de sistema
  (session as any).send({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user', 
      content: [{ 
        type: 'input_text', 
        text: '[SISTEMA]: O MÉDICO CHEGOU. PARE AGORA. NÃO FALE NADA. Chame a ferramenta save_triage_report com doctor_interrupted=true.' 
      }]
    }
  });

  // 2. Força a resposta. O TRUQUE ESTÁ AQUI:
  // Definimos modalities: ['text']. Isso impede a geração de áudio.
  // A IA vai gerar apenas texto (a chamada da função) e ficará muda.
  (session as any).send({
    type: 'response.create',
    response: {
      modalities: ['text'], 
      instructions: "Execute a tool em silêncio."
    }
  });
});

startBtn.addEventListener('click', startSession);