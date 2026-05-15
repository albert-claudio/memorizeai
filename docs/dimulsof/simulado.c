#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <locale.h>
#include <unistd.h>
#include <ctype.h>
#include <stdbool.h>

#define MAX 50 //const MAX=50;

struct Aluno{
    int matricula;
    char nome[MAX];
    float nota1;
    float nota2;
};

int op=0, opc=0, idg=0, idc=0, vmat=100;
struct Aluno a;
struct Aluno turma[MAX];

float calcularMedia(struct Aluno a){
    return (a.nota1+a.nota2)/2;
}

void cor(){
    int opc;
    printf("************************\n");
    printf("* 0 - Reset            *\n");
    printf("* 1 - Vermelho         *\n");
    printf("* 2 - Verde            *\n");
    printf("* 3 - Amarelo          *\n");
    printf("* 4 - Azul             *\n");
    printf("* 5 - Roxo             *\n");
    printf("* 6 - Ciano            *\n");
    printf("************************\n");
    printf("Escolha a cor: ");
    scanf("%d",&opc);
    system("clear");
    switch(opc){
        case 0:
            printf("\033[0m");
            break;
        case 1:
            printf("\033[1;31m");
            break;
        case 2:
            printf("\033[1;32m");
            break;
        case 3:
            printf("\033[1;33m");
            break;
        case 4:
            printf("\033[1;34m");
            break;
        case 5:
            printf("\033[1;35m");
            break;
        case 6:
            printf("\033[1;36m");
            break;
    }
}

void menu(){
    system("clear");
    printf("***********************************\n");
    printf("*          MENU PRINCIPAL         *\n");
    printf("***********************************\n");
    printf("*                                 *\n");
    printf("*   1 - CADASTRAR                 *\n");
    printf("*   2 - CONSULTAR                 *\n");
    printf("*   3 - ALTERAR                   *\n");
    printf("*   4 - EXCLUIR                   *\n");
    printf("*   5 - ORDENAR CRESCENTE         *\n");
    printf("*   6 - ORDENAR DECRESCENTE       *\n");
    printf("*   7 - IMPRIMIR                  *\n");
    printf("*   8 - COR DA TELA               *\n");
    printf("*   9 - FINALIZAR                 *\n");
    printf("*                                 *\n");
    printf("***********************************\n");
}

void menuAlterar(){
    system("clear");
    printf("***************************\n");
    printf("*       MENU ALTERAR      *\n");
    printf("***************************\n");
    printf("*  1 - NOME               *\n");
    printf("*  2 - NOTA 1             *\n");
    printf("*  3 - NOTA 2             *\n");
    printf("***************************\n");
}

void cadastrar(){
    char r;
    do{
        system("clear");
        a.matricula=vmat;
        printf("Matrícula: %d\n",vmat);
        vmat++;
        printf("Digite o nome: ");
        getchar(); // limpa o buffer do teclado
        fgets(a.nome, sizeof(a.nome), stdin);
        a.nome[strcspn(a.nome, "\n")] = '\0';
        
        printf("Digite a nota 1: ");
        scanf("%f",&a.nota1);
        printf("Digite a nota 2: ");
        scanf("%f",&a.nota2);
        
        turma[idg++]=a;
        
        printf("\nDeseja continuar cadastrando [s/n]: ");
        scanf(" %c",&r);
    }while((tolower(r)=='s')&&(idg<MAX));
}

_Bool consultar(int mat){
    idc=0;
    _Bool enc=false;
    while((idc<idg)&&(enc==false)){
        if (turma[idc].matricula==mat){
            enc=true;
        }else{
            idc++;
        }
    }
    return enc;
}

void alterar(){
    menuAlterar();
    printf("\nEscolha a opção a ser alterada: ");
    scanf("%d",&opc);
    switch(opc){
        case 1:
            printf("\nDigite o novo nome: ");
            getchar(); // limpa o buffer do teclado
            fgets(turma[idc].nome, sizeof(turma[idc].nome), stdin);
            turma[idc].nome[strcspn(turma[idc].nome, "\n")] = '\0';
            break;
        case 2:
            printf("\nDigite a nova nota 1: ");
            scanf("%f",&turma[idc].nota1);
            break;
        case 3:
            printf("\nDigite a nova nota 2: ");
            scanf("%f",&turma[idc].nota2);
            break;
        default:
            printf("\nOpção inválida!\n");
            sleep(3);
            break;
            
    }
    if (opc>0 && opc<4){
        printf("Registro alterado com sucesso!\n");
        sleep(3);
    }
}

void excluir(int vidc){
    for(int i=vidc;i<idg-1;i++){
        turma[i]=turma[i+1];
    }
    idg--;
}

void imprimir(){
    for (int i=0;i<idg;i++){
        printf("Matricula: %d \n",turma[i].matricula);
        printf("Nome: %s \n",turma[i].nome);
        printf("Nota 1: %.2f \n",turma[i].nota1);
        printf("Nota 2: %.2f \n",turma[i].nota2);
        printf("Media: %.2f \n\n",calcularMedia(turma[i]));
    }
    sleep(3);
}

void ordenarcrescente(){
    for (int i=0;i<idg-1;i++){
        for (int y=i+1;y<idg;y++){
            if (turma[i].matricula>turma[y].matricula){
                a=turma[i];
                turma[i]=turma[y];
                turma[y]=a;
            }
        }
    }
    printf("Lista ordenada com sucesso!\n");
    sleep(3);
}

void ordenardecrescente(){
    for (int i=0;i<idg-1;i++){
        for (int y=i+1;y<idg;y++){
            if (turma[i].matricula<turma[y].matricula){
                a=turma[i];
                turma[i]=turma[y];
                turma[y]=a;
            }
        }
    }
    printf("Lista ordenada com sucesso!\n");
    sleep(3);
}

void main()
{
    int mat;
    setlocale(LC_ALL,"português");
    do{
        menu();
        printf("Escolha a opção desejada: ");
        scanf("%d",&op);
        system("clear");
        switch(op){
            case 1:
                if (idg<MAX){
                    cadastrar();
                }else{
                    printf("Tabela cheia!");
                    sleep(3);
                }
                break;
            case 2:
                printf("Digite a matricula a ser consultada: ");
                scanf("%d",&mat);
                if (consultar(mat)==true){
                    printf("Registro consta na tabela!\n");
                }else{
                    printf("Registro não consta na tabela!\n");
                }
                sleep(3);
                break;
            case 3:
                printf("Digite a matricula a ser consultada: ");
                scanf("%d",&mat);
                if (consultar(mat)==true){
                    alterar();
                }else{
                    printf("Registro não consta na tabela!\n");
                    sleep(3);
                }
                break;
            case 4:
                printf("Digite a matricula a ser consultada: ");
                scanf("%d",&mat);
                if (consultar(mat)==true){
                    excluir(idc);
                    printf("Registro excluído com sucesso!\n");
                }else{
                    printf("Registro não consta na tabela!\n");
                }
                sleep(3);
                break;
            case 5:
                ordenarcrescente();
                break;
            case 6:
                ordenardecrescente();
                break;
            case 7:
                imprimir();
                break;
            case 8:
                cor();
                break;
            default: 
                if (op!=9){
                    printf("Opção inválida!\n");
                    sleep(3);
                    break;
                }
        }
    }while(op!=9);
    system("clear");
    printf("Sistema finalizado com sucesso!");
}
